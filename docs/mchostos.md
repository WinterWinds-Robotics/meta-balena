# Multi-container hostOS applications

## Overview

A release of BalenaOS is defined in a compose file that specifies the different services that compose the operating system blocks. These hostOS block images are typically build, deployed and maintained separately.

The hostOS block services are formed of elementary image units with the following attributes defined as image labels:

* *io.balena.image.store=<target>*: Defines the target storage for the image. It defaults to _data_ for the data partition.
* *io.balena.image.class*: Defines the type of image and can be:
  * *io.balena.image.class=fileset*: The image contains a set of files to be copied to a specified target location.
  * *io.balena.class=overlay*: The image is to be mounted and overlaid over a specified location at boot time.
  * *io.balena.image.class=service*: The image is to be run by an engine or engine simulator. If no class level is present, _service_ is assumed.
* *io.balena.image.reboot-required*: Whether the image requires a reboot to take effect. Defaults to *no*.

The installation and update of the hostOS service images is managed by the supervisor.

## Overlay images

An overlay image is identified and mounted during the early boot process. These are non-essential blocks (not required for cloud connectivity) that extend the core hostOS.

The mouting of overlay images can be disabled by specifying a `balena.disable_overlays` argument to the kernel command line.

### Caveats

* Once BalenaOS has overlayed an image, the root filesystem cannot be remounted read-write.
* Only overlay2 images are supported.
* The numbers of overlaid images that can be mounted is capped by the length of the options passed to the kernel's do_mount() function which is currently the system's page size. For the typical paths in BalenaOS this is around 20 images.
