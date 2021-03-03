/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';

module.exports = {
	title: 'Self-serve HUP via dashboard test',
	run: async function(test) {
		await this.context.get().hup.initDUT(
			this, this.context.get().link);

		// TODO check https://github.com/balena-io/leviathan/blob/master/suites/release/tests/hostapp.js#L21
	},
};
