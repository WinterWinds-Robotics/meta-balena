/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';

module.exports = {
	title: 'Dummy test',
	run: async function(test) {
		const version = await this.context.get().huputils.getOsVersion(this);
		console.log(`VERSION: ${version}`);
		console.log(`Dummy test will succeed!`);
	},
};
