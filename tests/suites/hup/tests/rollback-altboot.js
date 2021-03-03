/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';

module.exports = {
	title: 'Rollback altboot (broken init) test',
	run: async function(test) {
		await this.context.get().hup.initDUT(
			this, this.context.get().link);

		// TODO
	},
};
