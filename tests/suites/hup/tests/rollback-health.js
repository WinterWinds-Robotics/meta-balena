/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';

module.exports = {
	title: 'Rollback health tests',
	tests: [
		{
			title: 'Broken balena-engine',
			run: async function(test) {
				await this.context.get().hup.initDUT(
					this, this.context.get().link);

			// TODO
			},
		},
		{
			title: 'Broken VPN',
			run: async function(test) {
				await this.context.get().hup.initDUT(
					this, this.context.get().link);

			// TODO
			},
		},
	]
};
