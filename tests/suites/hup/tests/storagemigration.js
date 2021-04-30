/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';

const shouldMigrate = async (that) => { // {{{
  // check if both aufs and overlayfs are supported, otherwise skip
  if (await that.context.get().worker.executeCommandInHostOS(
      `balena info 2>/dev/null | grep -o -e aufs -e overlay2`,
      that.context.get().link,
    ) === "overlay2") {
    that.log(`Already using overlayfs, skipping migration test.`)
    return false;
  }
  if (await that.context.get().worker.executeCommandInHostOS(
      `grep overlay /proc/filesystems >/dev/null && echo pass`,
      that.context.get().link,
    ) !== "pass") {
    that.log(`Both aufs and overlayfs have to be supported to run a migration.`)
    return false;
  }
  return true;
} // }}}
// }}}

module.exports = {
  title: 'Storage migration test',
  // deviceType: {}, // TODO
  tests: [
    {
      title: 'Check successful migration', // {{{
      run: async function(test) {
        await this.context.get().hup.initDUT(
          this, this.context.get().link);

        if (! shouldMigrate(this)) {
          return; // SKIP
        }

        const oldOsVersion = await this.context.get().hup.getOSVersion(
          this, this.context.get().link);
        this.log(`OS version before HUP: ${oldOsVersion}`);

        this.log(`Creating data to migrate`);
        await this.context.get().worker.executeCommandInHostOS(
            `balena pull balenalib/${this.suite.deviceType.slug}-debian:buster && balena run -d --name test balenalib/${this.suite.deviceType.slug}-debian:buster balena-idle`,
            this.context.get().link,
          );

        try {
          await this.context.get().hup.doHUP(this, 'image', this.context.get().hup.payload, this.context.get().link);

          const driver = await this.context.get().worker.executeCommandInHostOS(
              `set -x; balena info 2>/dev/null | grep 'Storage Driver' && balena ps`,
              this.context.get().link,
            );
          this.log(driver);

          const migrationLogs = await this.context.get().worker.executeCommandInHostOS(
              `set -x; journalctl -ru balena | grep 'storage migration'`,
              this.context.get().link,
            );
          this.log(`Engine logs: ${migrationLogs}`);

          const diskSize = await this.context.get().worker.executeCommandInHostOS(
              `set -x; balena image ls --format '{{.Size}}' | awk 'BEGIN{t=0; k=1000;M=k*1000;G=M*1000;} /kB$/{sub("kB","");t+=($0*k);} /MB$/{sub("MB","");t+=($0*M);} /GB$/{sub("GB","");t+=($0*G);} END{print t}'`,
              this.context.get().link,
            );
          this.log(`Total image size on disk: ${diskSize}`);
          this.log("Migration successful");

        } catch (e) {
          await this.context.get().hup.diagnose(this, this.context.get().link);
          throw e;
        }
      } // }}}
    },
    {
      title: 'Gracefully skip migration', // {{{
      run: async function(test) {
        await this.context.get().hup.initDUT(
          this, this.context.get().link);

        // switch storage driver to overlayfs
        // NOTE: assumes prod image
        await this.context.get().worker.executeCommandInHostOS(
            `mount -o remount,rw / && sed -e 's/-s aufs/-s overlay2/' -i /etc/systemd/system/balena-engine.service && systemctl daemon-reload && systemctl restart balena && mount -o remount,ro /`,
            this.context.get().link,
          );

        const oldOsVersion = await this.context.get().hup.getOSVersion(
          this, this.context.get().link);
        this.log(`OS version before HUP: ${oldOsVersion}`);

        this.log(`Creating data to migrate`);
        await this.context.get().worker.executeCommandInHostOS(
            `balena pull balenalib/${this.suite.deviceType.slug}-debian:buster && balena run -d --name test balenalib/${this.suite.deviceType.slug}-debian:buster balena-idle`,
            this.context.get().link,
          );

        const testbot = await getTestbotIP(this);

        try {
          await this.context.get().hup.doHUP(this, 'image', `${testbot}:5000/hostapp:latest`, this.context.get().link);

          const migrationLogs = await this.context.get().worker.executeCommandInHostOS(
              `set -x; journalctl -ru balena | grep 'storage migration'`,
              this.context.get().link,
            );
          this.log(`Engine logs: ${migrationLogs}`);

        } catch (e) {
          await this.context.get().hup.diagnose(this, this.context.get().link);
          throw e;
        }
      } // }}}
    },
  ]
};
