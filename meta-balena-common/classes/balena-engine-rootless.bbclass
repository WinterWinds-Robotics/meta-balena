DEPENDS += "balena-native slirp4netns-native os-helpers-native rootlesskit-native"

# Need a short path here as unix sockets paths have a maximum length of 104 characters
ENGINE_DIR ?= "${TOPDIR}/${PN}"
# Make sure these are on a real ext4 filesystem and not inside a container filesystem
# Socket is created in exec-root so path must be short
ENGINE_EXEC_ROOT="${ENGINE_DIR}/${BB_CURRENTTASK}-root"
ENGINE_DATA_ROOT="${ENGINE_DIR}/${BB_CURRENTTASK}-data"
ENGINE_SOCK = "${ENGINE_DIR}/balena.sock"
DOCKER_HOST = "unix://${ENGINE_SOCK}"
ENGINE_PIDFILE = "${WORKDIR}/balena-engine.pid"
ENGINE_CLIENT_NAME = "balena"
ENGINE_NAME = "balenad"
ENGINE_CLIENT = "env DOCKER_HOST=${DOCKER_HOST} ${ENGINE_CLIENT_NAME}"

do_run_engine() {
    set -x
    mkdir -p "${ENGINE_DIR}"
    if [ -f "${ENGINE_PIDFILE}" ]; then
        # Already running
        return
    fi
    # Make sure newuidmap/newgidmap are used from the host tools as they need to be setuid'ed
    exec env PATH="${HOSTTOOLS_DIR}:${PATH}" XDG_RUNTIME_DIR=${ENGINE_DIR} balenad-rootless.sh --experimental --pidfile ${ENGINE_PIDFILE} -H ${DOCKER_HOST} --exec-root ${ENGINE_EXEC_ROOT} --data-root ${ENGINE_DATA_ROOT} > ${WORKDIR}/temp/log.balenad-rootless-run-${BB_CURRENTTASK} 2>&1 &
    #exec env PATH="${HOSTTOOLS_DIR}:${PATH}" XDG_RUNTIME_DIR=${ENGINE_DIR} balenad-rootless.sh --experimental --pidfile ${ENGINE_PIDFILE} -H ${DOCKER_HOST} --exec-root ${ENGINE_EXEC_ROOT} > ${WORKDIR}/temp/log.balenad-rootless-run-${BB_CURRENTTASK} 2>&1 &
    . "${STAGING_DIR_NATIVE}/usr/libexec/balena-docker.inc"
    balena_docker_wait "${DOCKER_HOST}" "balena" > ${WORKDIR}/temp/log.balenad-rootless-wait-${BB_CURRENTTASK} 2>&1
}

do_stop_engine() {
    set -x
    . "${STAGING_DIR_NATIVE}/usr/libexec/balena-docker.inc"
    balena_docker_stop fail "${ENGINE_PIDFILE}" "${ENGINE_NAME}" > ${WORKDIR}/temp/log.balenad-rootless-stop-${BB_CURRENTTASK} 2>&1
}

do_compile_prepend() {
    do_run_engine
}

do_compile_append() {
    do_stop_engine
}

do_run_engine_hostapp_ext4() {
    do_run_engine
}

do_stop_engine_hostapp_ext4() {
    do_stop_engine
}

addtask do_run_engine before do_image_docker after do_rootfs
addtask do_stop_engine before do_image_hostapp_ext4 after do_image_docker
addtask do_run_engine_hostapp_ext4 before do_image_hostapp_ext4 after do_stop_engine
addtask do_stop_engine_hostapp_ext4 before do_image_balenaos-img after do_image_hostapp_ext4

# Do not try to start more than one engine
do_compile[lockfiles] += "${TMPDIR}/balena-engine-rootless.lock"
do_rootfs[lockfiles] += "${TMPDIR}/balena-engine-rootless.lock"
do_image_docker[lockfiles] += "${TMPDIR}/balena-engine-rootless.lock"
do_image_hostapp_ext4[lockfiles] += "${TMPDIR}/balena-engine-rootless.lock"

do_run_engine[nostamp] = "1"
do_stop_engine[nostamp] = "1"
do_run_engine_hostapp_ext4[nostamp] = "1"
do_stop_engine_hostapp_ext4[nostamp] = "1"

do_run_engine[depends] = " \
    os-helpers-native:do_populate_sysroot \
    balena-native:do_populate_sysroot \
    slirp4netns-native:do_populate_sysroot \
    rootlesskit-native:do_populate_sysroot \
    "
