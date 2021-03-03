
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
