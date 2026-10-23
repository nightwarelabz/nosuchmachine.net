# Nightjar homepage sources

Reviewed October 23, 2026. The homepage presents NIGHTWARE LABZ and its flagship nightjar using the project's public documentation and existing brand assets. The canonical GitHub account is `nightwarelabz`; older `chasebryan` URLs redirect there.

## Product and installation

- [Current README](https://github.com/nightwarelabz/nightjar/blob/main/README.md): native iPhone and Mac apps, iPhone as flagship, iOS 17+ and macOS 14+, the listening/protocol/recon instruments, Skelli, Blacksite, EMCON, Knocktalk, Vault, and installation requirements.
- [Get started](https://github.com/nightwarelabz/nightjar#get-started): build and sideload instructions. The README explicitly states that there is no App Store or TestFlight listing. An iOS package needs signing and provisioning suitable for the device. The native Mac app is built from the same Xcode project.
- [Latest releases](https://github.com/nightwarelabz/nightjar/releases): the primary destination for available release packages. At review time the latest public release is [v11 — churring](https://github.com/nightwarelabz/nightjar/releases/tag/v11), published October 21, 2026. Its only attached asset is `nightjar.ipa`; there is no Mac binary or OTA install manifest attached.
- [Installation and OTA guide](https://github.com/nightwarelabz/nightjar/blob/main/ota/README.md): signing, ad hoc distribution, and SideStore. In-app OTA installation is conditional on an appropriate build and manifest. Do not present it as a universal one-tap installation path.
- [SideStore source](https://github.com/nightwarelabz/nightjar/blob/main/sidestore-source.json): current source metadata and the canonical package address. The source URL is `https://raw.githubusercontent.com/nightwarelabz/nightjar/main/sidestore-source.json`.

## Claims and their limits

- [Privacy policy](https://github.com/nightwarelabz/nightjar/blob/main/PRIVACY.md), updated October 17, 2026: no accounts, analytics, advertising, crash-reporting SDKs, or developer collection. App records are stored on-device and exports are user-directed.
- Skelli's model inference runs on-device. Requested research, model downloads, GitHub update checks, and connections configured by the operator use the network. The site must not describe the whole app as fully offline.
- Listen receives Bluetooth LE advertisements without connecting or pairing. That statement applies to Listen, not to every network operation in the app.
- [iOS documentation](https://github.com/nightwarelabz/nightjar/blob/main/ios/README.md): scanning uses connections; raw SYN scans, ARP manipulation, packet injection, and live packet capture are outside the app's iOS interface. Imported captures can be dissected. Foreground socket work follows platform lifecycle rules.
- [Blacksite manual](https://github.com/nightwarelabz/nightjar/blob/main/docs/blacksite/README.md): shell, editors, file tree, protocol audit bench, and EAZY reports. The homepage describes capabilities without promising independent certification or guaranteed security outcomes.
- The source asks operators to use nightjar on devices and networks they own or have written authorization to test.

## Source and release distinction

The default branch has continued to evolve after v11. Its current README describes fourteen rooms, while the [README at the v11 tag](https://github.com/nightwarelabz/nightjar/blob/v11/README.md) says twelve tabs. The current Blacksite manual describes 413 commands and 290 bench commands; the v11 release notes describe 23 audit instruments. The release notes mention the native Mac app even though the tagged README still describes iOS as the sole line.

For these reasons, the homepage uses the current canonical README for the product overview, links releases for downloadable builds, and avoids numerical feature inventories. An overview of current source capabilities is not a promise that every feature is present in an older downloaded package. Recheck documentation and release assets before adding fixed counts, a version badge, or new download promises.

## Original visual assets

These are existing project assets, not newly generated logos or screenshots:

- [NIGHTWARE LABZ wordmark/banner](https://github.com/nightwarelabz/nightjar/blob/main/ios/nightjar/Assets.xcassets/NightwareBanner.imageset/nightware-banner.png)
- [Stallion mark](https://github.com/nightwarelabz/nightjar/blob/main/ios/nightjar/Assets.xcassets/NightwareMark.imageset/nightware-mark.png)
- [App icon](https://github.com/nightwarelabz/nightjar/blob/main/ios/nightjar/Assets.xcassets/AppIcon.appiconset/IMG_1434.png)
- [README hero](https://github.com/nightwarelabz/nightjar/blob/main/assets/readme/nightjar-hero.svg)

The hero defines the established visual language: a black stallion with a crimson eye, black `#080A0D`, steel `#242830`, silver `#CDD2DA`, and crimson `#D70B28`. Asset filenames in the site may differ after local optimization. Product illustrations should not be described as authentic application screenshots unless they are captures of the running app.

## About the lab

The current README identifies Chase Bryan as a cryptographer and builder, and names orange, snoot, mawkbox, and Magic Box as other work. The existing site catalog and Orange Book remain intact. Their historical curation metadata does not determine the homepage's primary product.
