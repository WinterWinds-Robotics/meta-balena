/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';

module.exports = {
  title: 'Smoke test',
  run: async function(test) {
    await this.context.get().hup.initDUT(
      this, this.context.get().link);

    const before = await this.context.get().hup.getOSVersion(
      this, this.context.get().link);
    this.log(`VERSION: ${before}`);

    await this.context.get().hup.doHUP(this, 'image', this.context.get().hup.payload, this.context.get().link);

    const after = await this.context.get().hup.getOSVersion(
      this, this.context.get().link);
    this.log(`VERSION: ${after}`);

    // TODO do we need to wait for rollback to kick in?
  },
};
