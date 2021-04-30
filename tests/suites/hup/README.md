
# Hostapp UPdate tests

Test the transition between balenaOS releases via the `hostapp-update` mechanism.

## setup

1. Run a registry on the testbot
2. Push the "os-under-test" to the registry
3. Run tests, repeating the following:
	1. Flash the DUT with the latest balenaOS release (`balena os download --version latest ...`)
	2. _do test case specific stuff for setup_
	3. Run `hostapp-update -i <testbot>:5000/hostapp`
	4. Wait for the DUT to come back online
	5. _do test case specific stuff to check_


## current tests

* [smoke test](./tests/smoke.js): simply do a HUP and print before and after OS versions

* [storage migration](./tests/storagemigration.js): check aufs to overlayfs migration
  * [x] do migration
  * [x] skip migration
  * [ ] fail migration

## TODO

* [self-serve-dashboard](./tests/self-serve-dashboard.js)
* [rollback-altboot](./tests/rollback-altboot.js)
* [rollback-health](./tests/rollback-health.js)
