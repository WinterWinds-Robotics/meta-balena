/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const fse = require("fs-extra");
const { join } = require("path");
const { homedir } = require("os");
const imagefs = require('balena-image-fs');
const Docker = require('dockerode');
const { spawn } = require('child_process');
const retry = require('bluebird-retry');
const exec = require('bluebird').promisify(require('child_process').exec);

// utils funcs {{{
const fetchOS = async (that, version, path) => { // {{{2
    that.log(`Fetching balenaOS version ${version}`);
    if (await fse.pathExists(path)) {
      that.log(`[Cached used]`);
      return;
    }

    let attempt = 0;
    const dlOp = async () => {
      attempt++;
      that.log(`Fetching balenaOS version ${version}, attempt ${attempt}...`);

      // TODO progress
      return that.context.get().sdk.getDownloadStream(
          that.suite.deviceType.slug,
          version,
        );
    };
    const stream = await retry(dlOp, { max_retries: 3, interval: 500 })
    await new Promise((resolve, reject) => {
      stream.pipe(fs.createWriteStream(path))
        .on("finish", resolve)
        .on("error", reject);
    });
};
// 2}}}

// configureOS {{{2
const injectBalenaConfiguration = (image, configuration) => { // {{{3
  // taken from: https://github.com/balena-io/leviathan/blob/master/core/lib/components/os/balenaos.js#L31
  return imagefs.interact(image, 1, async (fs) => {
    return require("util").promisify(fs.writeFile)("/config.json",
      JSON.stringify(configuration));
  });
}; // 3}}}
const injectNetworkConfiguration = async (image, configuration) => { // {{{3
  // taken from: https://github.com/balena-io/leviathan/blob/master/core/lib/components/os/balenaos.js#L43
  if (configuration.wireless == null) {
    return;
  }
  if (configuration.wireless.ssid == null) {
    throw new Error(
      `Invalide wireless configuration: ${configuration.wireless}`,
    );
  }

  const wifiConfiguration = [
    '[connection]',
    'id=balena-wifi',
    'type=wifi',
    '[wifi]',
    'hidden=true',
    'mode=infrastructure',
    `ssid=${configuration.wireless.ssid}`,
    '[ipv4]',
    'method=auto',
    '[ipv6]',
    'addr-gen-mode=stable-privacy',
    'method=auto',
  ];

  if (configuration.wireless.psk) {
    Reflect.apply(wifiConfiguration.push, wifiConfiguration, [
      '[wifi-security]',
      'auth-alg=open',
      'key-mgmt=wpa-psk',
      `psk=${configuration.wireless.psk}`,
    ]);
  }

  await imagefs.interact(image, 1, async (fs) => {
    return require("util").promisify(fs.writeFile)("/system-connections/balena-wifi",
      wifiConfiguration.join('\n'));
  });
}; // 3}}}
const configureOS = async (that, imagePath, network, configJson) => {
  that.log(`Configuring base image`);
  await injectBalenaConfiguration(imagePath, configJson);
  await injectNetworkConfiguration(imagePath, network);
};
// 2}}}

const runRegistry = async (that, seedWithImage) => { // {{{2
  const docker = new Docker();

  const container = await docker.createContainer({
    Image: 'registry:2',
    HostConfig: {
      AutoRemove: true,
      Mounts: [{
        Type: 'tmpfs',
        Target:'/var/lib/registry'
      }],
      PortBindings: {
        "5000/tcp": [{
          "HostPort": "5000",
        }],
      },
    }

  }).then((container) => {
    that.log("Starting registry");
    return container.start();
  });

  that.suite.teardown.register(async () => {
      try {
        await container.stop();
        await container.remove();
      } catch (err) {
        that.log(`Error removing registry container: ${err}`);
      }
    });

  that.log("Loading image into registry");
  const imageName = await docker.loadImage(seedWithImage)
    .then(res => {
        return new Promise((resolve, reject) => {
          var bufs = [];
          res.on('error', err => reject(err));
          res.on('data', data => bufs.push(data));
          res.on('end', () => resolve(JSON.parse(Buffer.concat(bufs))));
        });
      })
    .then(json => {
        const str = json.stream.split('Loaded image ID: ');
        if (str.length === 2) {
          return str[1].trim();
        }
        throw new Error('failed to parse image name from loadImage stream');
      });

  const image = await docker.getImage(imageName);
  const ref = 'localhost:5000/hostapp';

  await image.tag({repo: ref, tag: 'latest'});
  const tagged = await docker.getImage(ref);
  const digest = await tagged.push({ref})
    .then(res => {
        return new Promise((resolve, reject) => {
          var bufs = [];
          res.on('error', err => reject(err));
          res.on('data', data => bufs.push(JSON.parse(data)));
          res.on('end', () => resolve(bufs));
        });
      })
    .then(output => {
        for (let json of output) {
          if (json.error) {
            throw new Error(json.error);
          }
          if (json.aux && json.aux.Digest) {
            return json.aux.Digest;
          }
        }
        throw new Error('no digest');
      });
  await image.remove();

  // this parses the IP of the wlan0 interface which is the gateway for the DUT
  // TODO should this be a common func?
  const testbotIP = (await exec(`ip addr | awk '/inet.*wlan0/{print $2}' | cut -d\/ -f1`)).trim();
  const hostappRef = `${testbotIP}:5000/hostapp@${digest}`;
  that.log(`Registry upload complete: ${hostappRef}`);

  that.suite.context.set({
    hup: {
      payload: hostappRef,
    }
  })
} // 2}}}

const doHUP = async (that, mode, hostapp, target) => { // {{{2
    that.log(`Starting HUP`);

    await that.context.get().worker.executeCommandInHostOS(
        'touch /tmp/reboot-check',
        target,
      );

    switch (mode) {
      case 'local':
        if (await that.context.get().worker.executeCommandInHostOS(
            `[[ -f ${hostapp} ]] && echo exists`,
            target,
          ) !== 'exists') {
            throw new Error(
              `Target image doesn't exists at location "${hostapp}"`,
            );
        }
        that.log(`Running: hostapp-update -f ${hostapp}`);
        that.log(await that.context.get().worker.executeCommandInHostOS(
            `hostapp-update -f ${hostapp}`,
            target,
          ));
        break;

      case 'image':
        that.log(`Running: hostapp-update -i ${hostapp}`);
        that.log(await that.context.get().worker.executeCommandInHostOS(
            `hostapp-update -i ${hostapp}`,
            target,
          ));
        break;

      default:
        throw new Error(`Unsupported HUP mode: ${mode}`);
    }

    that.log("Rebooting DUT")
    await that.context.get().worker.executeCommandInHostOS(
        `systemd-run --on-active=2 reboot`,
        target,
      );

    await that.context.get().utils.waitUntil(async () => {
      return (
        (await that.context.get().worker.executeCommandInHostOS(
            '[[ ! -f /tmp/reboot-check ]] && echo "pass"',
            target,
          )) === 'pass'
      );
    });

    that.log(`Finished HUP`);
};
// 2}}}

const flashOS = async (that, image) => { // {{{2
    that.log(`Flashing DUT`);

    await that.context.get().worker.off();
    await that.context.get().worker.flash(image);
    await that.context.get().worker.on();

    that.log("Waiting for DUT to be reachable");
    assert.equal(
      await that.context
        .get()
        .worker.executeCommandInHostOS(
          "cat /etc/hostname",
          that.context.get().link
        ),
      that.context.get().link.split(".")[0],
      "Device should be reachable"
    );
    that.log("DUT flashed");
}
// 2}}}

const getOSVersion = async (that, target) => { // {{{2
  // maybe https://github.com/balena-io/leviathan/blob/master/core/lib/components/balena/sdk.js#L210
  // will do? that one works entirely on the device though...
    const output = await that.context.get().worker
      .executeCommandInHostOS(
        "cat /etc/os-release",
        target
      );
    let match;
    output
      .split("\n")
      .every(x => {
        if (x.startsWith("VERSION=")) {
          match = x.split("=")[1];
          return false;
        }
        return true;
      })
    return match.replace(/"/g, '');
} // 2}}}

const initDUT = async (that, target) => { // {{{2
  that.log(`Initializing DUT for HUP test`);
  await that.context.get().hup.flashOS(that, that.context.get().hup.baseOsImage);
  that.log(`Configuring DUT to use test suite registry`);
  await that.context.get().worker.executeCommandInHostOS(
      `mount -o remount,rw / && sed -e "s/driver=systemd/driver=systemd --insecure-registry=$(ip route | awk '/default/{print $3}'):5000/" -i /lib/systemd/system/balena-host.service && systemctl daemon-reload && systemctl restart balena-host && mount -o remount,ro /`,
      target,
    );
} // 2}}}
// }}}

module.exports = {
  title: "Hostapp update suite",

  run: async function () {
    const Worker = this.require("common/worker");
    const BalenaOS = this.require("components/os/balenaos");
    const Balena = this.require("components/balena/sdk");

    await fse.ensureDir(this.suite.options.tmpdir);

    this.suite.context.set({
      utils: this.require("common/utils"),
      sdk: new Balena(this.suite.options.balena.apiUrl, this.getLogger()),
      sshKeyPath: join(homedir(), "id"),
      link: `${this.suite.options.balenaOS.config.uuid.slice(0, 7)}.local`,
      worker: new Worker(this.suite.deviceType.slug, this.getLogger()),
    });

    // Network definitions {{{
    if (this.suite.options.balenaOS.network.wired === true) {
      this.suite.options.balenaOS.network.wired = {
        nat: true,
      };
    } else {
      delete this.suite.options.balenaOS.network.wired;
    }
    if (this.suite.options.balenaOS.network.wireless === true) {
      this.suite.options.balenaOS.network.wireless = {
        ssid: this.suite.options.id,
        psk: `${this.suite.options.id}_psk`,
        nat: true,
      };
    } else {
      delete this.suite.options.balenaOS.network.wireless;
    }
    // }}}

    this.suite.context.set({
      os: new BalenaOS(
        {
          deviceType: this.suite.deviceType.slug,
          network: this.suite.options.balenaOS.network,
          configJson: {
            uuid: this.suite.options.balenaOS.config.uuid,
            os: {
              sshKeys: [
                await this.context
                  .get()
                  .utils.createSSHKey(this.context.get().sshKeyPath),
              ],
            },
            // persistentLogging is managed by the supervisor and only read at first boot
            persistentLogging: true,
          },
        },
        this.getLogger()
      ),

      hup: {
        baseOsImage: join(this.suite.options.tmpdir, `base.img`),
        targetOsImage: `${__dirname}/hostapp.docker`,

        doHUP: doHUP,
        fetchOS: fetchOS,
        configureOS: configureOS,
        flashOS: flashOS,
        getOSVersion: getOSVersion,
        initDUT: initDUT,
        runRegistry: runRegistry,
      },
    });

    this.suite.teardown.register(() => {
      this.log("Worker teardown");
      return this.context.get().worker.teardown();
    });

    this.log("Setting up worker");
    await this.context
      .get()
      .worker.network(this.suite.options.balenaOS.network);

    await this.context.get().hup.runRegistry(this, this.context.get().hup.targetOsImage);

    await this.context.get().hup.fetchOS(
      this,
      this.suite.options.balenaOS.download.version,
      this.context.get().hup.baseOsImage,
    );
    await this.context.get().hup.configureOS(
      this,
      this.context.get().hup.baseOsImage,
      this.suite.options.balenaOS.network,
      this.context.get().os.configJson,
    );
  },
  tests: [
    "./tests/smoke",
    "./tests/storagemigration",
    // "./tests/self-serve-dashboard",
    // "./tests/rollback-altboot",
    // "./tests/rollback-health",
  ],
};
