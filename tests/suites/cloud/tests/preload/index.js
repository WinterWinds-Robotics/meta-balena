"use strict";
const { exec } = require("mz/child_process");

module.exports = {
  title: "Image preload test",
  run: async function (test) {
    // get the latest commit from the app
    let commit = await this.context
      .get()
      .cloud.balena.models.application.get(
        this.context.get().balena.application
      )
      .get("commit");

    // preload the image
    test.comment("Preloading image...");
    await this.context.get().cli.preload(this.context.get().os.image.path, {
      app: this.context.get().balena.application,
      commit: commit,
      pin: true,
    });

    // power off DUT
    await this.context.get().worker.off();

    // push new release to app
    test.comment(`Pushing release to app...`);
    await exec(
      `balena push ${
        this.context.get().balena.application
      } --source ${__dirname}/../../app`
    );
    //check new commit of app
    let firstCommit = await this.context
      .get()
      .cloud.balena.models.application.get(
        this.context.get().balena.application
      )
      .get("commit");
    test.comment(`New application commit is ${firstCommit}`);

    // Push another release - now the application commit should be 2 ahead of the device
    test.comment(`Pushing release to app...`);
    await exec(
      `balena push ${
        this.context.get().balena.application
      } --source ${__dirname}/../../app`
    );
    //check new commit of app
    let secondCommit = await this.context
      .get()
      .cloud.balena.models.application.get(
        this.context.get().balena.application
      )
      .get("commit");
    test.comment(`New application commit is ${secondCommit}`);

    await this.context.get().worker.flash(this.context.get().os.image.path);
    await this.context.get().worker.on();

    // power on DUT, should see it pinned to the old release
    await this.context.get().utils.waitUntil(() => {
      return this.context
        .get()
        .cloud.balena.models.device.isOnline(this.context.get().balena.uuid);
    }, false);

    let deviceCommit = null;

    await this.context.get().utils.waitUntil(async () => {
      test.comment("Checking device commit...");
      deviceCommit = await this.context
        .get()
        .cloud.balena.models.device.get(this.context.get().balena.uuid)
        .get("is_on__commit");
      return deviceCommit === commit;
    }, false);

    test.is(deviceCommit, commit, `Preload commit hash should be ${commit}`);
    // check that there is nothing being downloaded??
    // look in logs, shouldn't see any downloading, just running the application

    // unpin device from release after so next tests aren't interfered with
    await this.context
      .get()
      .cloud.balena.models.device.trackApplicationRelease(
        this.context.get().balena.uuid
      );
  },
};
