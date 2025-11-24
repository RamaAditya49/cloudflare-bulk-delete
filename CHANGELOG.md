# [1.2.0](https://github.com/RamaAditya49/cloudflare-bulk-delete/compare/v1.1.1...v1.2.0) (2025-11-24)


### Features

* add GitHub Actions CI workflow and remove @semantic-release/npm dependency ([52c7a9a](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/52c7a9abad2bfd654ab0a418bea089f2d07a9c63))

## [1.1.1](https://github.com/RamaAditya49/cloudflare-bulk-delete/compare/v1.1.0...v1.1.1) (2025-11-20)


### Bug Fixes

* resolve npm audit vulnerabilities ([89a6499](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/89a6499230c12d7c1856128a001191a7491798cf))

# [1.1.0](https://github.com/RamaAditya49/cloudflare-bulk-delete/compare/v1.0.1...v1.1.0) (2025-11-20)


### Bug Fixes

* resolve npm audit vulnerabilities and update workflow ([87e38d6](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/87e38d6a7c1923cfffbdb9e05b3c9e2904807aa3)), closes [#20](https://github.com/RamaAditya49/cloudflare-bulk-delete/issues/20)
* restore correct workflow file content ([cd660a6](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/cd660a643e536429d57297bfd08bdba5d471edc0))
* update dependencies and adjust security audit level ([034c212](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/034c212f5321d2a19d20fd172e912b258c981a4d))
* update Node.js to v22 and regenerate package-lock ([f63efe9](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/f63efe9009940a6786346ab4ecad51a5c7e7eb5d))
* use npm install and simplify workflow ([6969787](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/6969787f74fbdb1509c622434939f4071f7f1a21))
* use npm install instead of npm ci in workflow ([0b7a813](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/0b7a813e6b6b3ef7c73fa139feef04e6af57d40a))
* use npx for eslint in CI workflow ([4dcdd7e](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/4dcdd7e046c7d18f8faccbb8fd1dd13827871e09))


### Features

* add force parameter and automated release workflow ([5d077b1](https://github.com/RamaAditya49/cloudflare-bulk-delete/commit/5d077b1ed661f096a98df68dbd5a588901c5622e))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Force parameter support for aliased deployment deletion
- Comprehensive README token setup tutorial
- Automated release workflow with semantic-release

### Changed
- Enhanced documentation with detailed troubleshooting section
- Improved test coverage for force parameter functionality

### Fixed
- Aliased deployment deletion error with `force=true` parameter
