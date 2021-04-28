`use strict`;
const { exec } = require("mz/child_process");
const Bluebird = require("bluebird");

module.exports = {
  title: "Supervisor test suite",
  tests: [
    {
      title: "Provisioning without deltas",
      run: async function (test) {
        // should see deltas being disabled in logs

        // push an app
        // push multicontainer app release to new app
        test.comment(`Cloning repo...`);
        await exec(
          `git clone https://github.com/balena-io-examples/balena-python-hello-world.git ${__dirname}/app`
        );

        test.comment(`Pushing release...`);
        await exec(
          `balena push ${
            this.context.get().balena.application
          } --source ${__dirname}/app`
        );

        // get application commit latest
        //check new commit of app
        let firstCommit = await this.context
          .get()
          .cloud.balena.models.application.get(
            this.context.get().balena.application
          )
          .get("commit");

        test.comment(`Application commit is ${firstCommit}`);

        // wait untul we have the application downloaded
        await this.context.get().utils.waitUntil(async () => {
          test.comment("Checking if expected services are all running...");
          let services = await this.context
            .get()
            .cloud.balena.models.device.getWithServiceDetails(
              this.context.get().balena.uuid
            );
          return (
            services.current_services.main[0].status === "Running" &&
            services.current_services.main[0].commit === firstCommit
          );
        }, false);

        test.comment(`Disabling deltas`);
        await this.context
          .get()
          .cloud.balena.models.device.configVar.set(
            this.context.get().balena.uuid,
            "RESIN_SUPERVISOR_DELTA",
            0
          );

        // add a comment to the end of the main.py file, to trigger a delta
        await exec(`echo "#comment" >> ${__dirname}/app/src/main.py`);
        test.comment(`Pushing release...`);
        await exec(
          `balena push ${
            this.context.get().balena.application
          } --source ${__dirname}/app`
        );
        let secondCommit = "";
        await this.context.get().utils.waitUntil(async () => {
          secondCommit = await this.context
            .get()
            .cloud.balena.models.application.get(
              this.context.get().balena.application
            )
            .get("commit");

          test.comment(`Application commit is ${secondCommit}`);
          return secondCommit !== firstCommit;
        }, false);

        //check device is now on new commit
        await this.context.get().utils.waitUntil(async () => {
          test.comment("Checking if expected services are all running...");
          let services = await this.context
            .get()
            .cloud.balena.models.device.getWithServiceDetails(
              this.context.get().balena.uuid
            );
          return (
            services.current_services.main[0].status === "Running" &&
            services.current_services.main[0].commit === secondCommit
          );
        }, false);

        // device should download application without mentioning that deltas are being used
        let logs = await this.context
          .get()
          .cloud.balena.logs.history(this.context.get().balena.uuid)
          .map((log) => {
            return log.message;
          });

        // check the device logs to check if deltas are being used
        let deltaIndex = logs.indexOf(
          'Applied configuration change {"SUPERVISOR_DELTA":"0"}'
        );
        let logsAfterDeltaDisabled = logs.slice(deltaIndex);

        let pass = true;
        logsAfterDeltaDisabled.forEach((element) => {
          if (element.includes("Downloading delta for image")) {
            pass = false;
          }
        });

        test.is(
          pass,
          true,
          `Device shouldn't use deltas to download new release`
        );
      },
    },
    {
      title: "Supervisor reload test",
      run: async function (test) {
        // check with balena images if supervisor in device is correct
        let supervisor = await this.context
          .get()
          .cloud.executeCommandInHostOS(
            `balena images --format "{{.Repository}} {{.Tag}}" | grep supervisor`,
            this.context.get().balena.uuid
          );

        let supervisorVersion = supervisor.split(" v")[1];
        test.comment(`Supervisor versinon ${supervisorVersion} detected`);

        // remove supervisor container
        test.comment(`removing supervisor`);
        await this.context
          .get()
          .cloud.executeCommandInHostOS(
            `systemctl stop resin-supervisor && balena rm resin_supervisor && balena rmi -f $(balena images | grep supervisor | awk '{print $3}')`,
            this.context.get().balena.uuid
          );

        // push an update to the application
        test.comment(`Pushing release...`);
        await exec(
          `balena push ${
            this.context.get().balena.application
          } --source ${__dirname}/../../app`
        );
        let firstCommit = await this.context
          .get()
          .cloud.balena.models.application.get(
            this.context.get().balena.application
          )
          .get("commit");

        // need to check we aren't downloading ?

        // run supervisor update script
        // update-resin-supervisor
        test.comment(`running update supervisor script...`);
        await this.context
          .get()
          .cloud.executeCommandInHostOS(
            `update-resin-supervisor`,
            this.context.get().balena.uuid
          );

        //* balena images shows the same version of supervisor the device has started with
        let updatedsupervisorVersion = "";

        await this.context.get().utils.waitUntil(async () => {
          test.comment(`checking supervisor has been re-downloaded...`);
          updatedsupervisorVersion = await this.context
            .get()
            .cloud.executeCommandInHostOS(
              `balena exec resin_supervisor cat package.json | grep version`,
              this.context.get().balena.uuid
            );
          // replace with regexp
          updatedsupervisorVersion = updatedsupervisorVersion.split(" ");
          updatedsupervisorVersion = updatedsupervisorVersion[1].replace(
            `"`,
            ""
          );
          updatedsupervisorVersion = updatedsupervisorVersion.replace(`",`, "");
          return updatedsupervisorVersion === supervisorVersion;
        }, false);

        test.is(
          supervisorVersion,
          updatedsupervisorVersion,
          `Supervisor should have same version that it started with`
        );

        //* balena ps shows resin_supervisor running
        test.comment(`checking supervisor is running again...`);
        let supervisorRunning = await this.context
          .get()
          .cloud.executeCommandInHostOS(
            `balena ps | grep supervisor`,
            this.context.get().balena.uuid
          );

        test.is(
          supervisorRunning !== "",
          true,
          `Supervisor should now be running`
        );

        // when supervisor updated, you should see that the supervisor downloads the app - need to check its the right app somehow (logs??)
        await this.context.get().utils.waitUntil(async () => {
          test.comment("Checking if expected services are all running...");
          let services = await this.context
            .get()
            .cloud.balena.models.device.getWithServiceDetails(
              this.context.get().balena.uuid
            );
          return (
            services.current_services.main[0].status === "Running" &&
            services.current_services.main[0].commit === firstCommit
          );
        }, false);

        test.ok(
          true,
          `Device should have downloaded services from original app`
        );
      },
    },
    {
      title: "Override lock test",
      run: async function (test) {
        test.comment(`Cloning repo...`);
        await exec(
          `git clone https://github.com/balena-io-examples/balena-updates-lock.git ${__dirname}/lock`
        );

        test.comment(`Pushing release...`);
        await exec(
          `balena push ${
            this.context.get().balena.application
          } --source ${__dirname}/lock`
        );
        let firstCommit = await this.context
          .get()
          .cloud.balena.models.application.get(
            this.context.get().balena.application
          )
          .get("commit");
        test.comment(`First commit is ${firstCommit}`);

        await this.context.get().utils.waitUntil(async () => {
          test.comment("Checking if lockfile has been created...");

          let containerId = await this.context
            .get()
            .cloud.executeCommandInHostOS(
              `balena ps --format "{{.Names}}" | grep main`,
              this.context.get().balena.uuid
            );

          let lockfile = await this.context
            .get()
            .cloud.executeCommandInHostOS(
              `balena exec ${containerId} ls /tmp/balena`,
              this.context.get().balena.uuid
            );
          return lockfile === `updates.lock`;
        }, false);

        // push original application
        test.comment(`Pushing release...`);
        await exec(
          `balena push ${
            this.context.get().balena.application
          } --source ${__dirname}/../../app`
        );
        let secondCommit = await this.context
          .get()
          .cloud.balena.models.application.get(
            this.context.get().balena.application
          )
          .get("commit");
        test.comment(`Second commit is ${secondCommit}`);

        // check original application is downloaded - shouldn't be installed
        await this.context.get().utils.waitUntil(async () => {
          test.comment(
            "Checking if release is downloaded, but not installed..."
          );
          let services = await this.context
            .get()
            .cloud.balena.models.device.getWithServiceDetails(
              this.context.get().balena.uuid
            );
          let downloaded = false;
          let originalRunning = false;
          services.current_services.main.forEach((service) => {
            if (
              service.commit === secondCommit &&
              service.status === "Downloaded"
            ) {
              downloaded = true;
            }

            if (
              service.commit === firstCommit &&
              service.status === "Running"
            ) {
              originalRunning = true;
            }
          });
          return downloaded && originalRunning;
        }, false);

        test.ok(
          true,
          `Release should be downloaded, but not running due to lockfile`
        );

        // how do we check that it isn't eing installed but is downloaded???

        // enable lock override
        await this.context
          .get()
          .cloud.balena.models.device.configVar.set(
            this.context.get().balena.uuid,
            "BALENA_SUPERVISOR_OVERRIDE_LOCK",
            1
          );
        // check original application gets installed
        await this.context.get().utils.waitUntil(async () => {
          test.comment("Checking if expected services are all running...");
          let services = await this.context
            .get()
            .cloud.balena.models.device.getWithServiceDetails(
              this.context.get().balena.uuid
            );
          return (
            services.current_services.main[0].status === "Running" &&
            services.current_services.main[0].commit === secondCommit
          );
        }, false);

        test.ok(
          true,
          `Release should now be running, as override lock was enabled`
        );
      },
    },
  ],
};
