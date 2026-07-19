# Astly - Open Source License Report

Status: Living document, prepared for investor technical due diligence
Scope: Every open-source (and vendor) license used by the platform's software dependencies, what each license permits and requires, an explicit commercial-use assessment, the copyleft/restrictive components and their treatment, and the compliance obligations to meet.
Companion documents: [`TECH_STACK.md`](TECH_STACK.md) (the dependency inventory), [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md).

> Method: licenses were extracted directly from the installed dependency tree (`node_modules`) by reading the `license` field of every package's manifest - 744 package manifests scanned, covering direct and transitive dependencies. Figures reflect the installed versions resolved by the committed `package-lock.json`. This is the authoritative basis; for an ongoing program, a license scanner (e.g., `license-checker`, FOSSA, or Syft/Grype) should run in CI. Nothing here is legal advice; confirm conclusions with counsel for any license-sensitive decision.

---

## Table of Contents

1. Executive Summary and Commercial-Use Verdict
2. License Distribution (full dependency tree)
3. Direct Dependencies - License Table
4. License Categories Explained (permits / requires / commercial use)
5. Copyleft and Restrictive Components (detailed)
6. Vendor / Non-OSI Licenses (LINE LIFF)
7. Compliance Obligations and How to Meet Them
8. Commercial-Use Assessment
9. Forward-Looking: Licensing the In-House AI Model
10. Risk Register and DD Checklist
11. Appendix - Full Direct-Dependency Detail and Caveats

---

## 1. Executive Summary and Commercial-Use Verdict

The platform's software supply chain is overwhelmingly permissive open source and is suitable for commercial use. Of 744 scanned package manifests:

- ~85% are MIT, Apache-2.0, BSD, or ISC (permissive) - the most commercial-friendly licenses, requiring only that copyright/license notices be preserved.
- 0 strong-copyleft licenses (no GPL-2.0/3.0, no AGPL, no SSPL). This is the single most important finding: there is no license in the tree that could force Astly to open-source its proprietary application code or its hosted service.
- A small number of weak/file-level copyleft components (LGPL-3.0 and MPL-2.0) exist only as transitive libraries used unmodified; their obligations do not extend to Astly's own code, and commercial use is permitted.
- One vendor (non-OSI) license: the LINE LIFF SDK (`@line/liff` and its `@liff/*` modules) is governed by the LINE Developers Agreement, not an open-source license. It is the official SDK for building on the LINE platform, intended for commercial use, but governed by LINE's terms (review required).

Bottom line: Astly can use, modify, and commercially operate its software on these dependencies, subject to standard attribution obligations and a review of the LINE Developers Agreement. There is no copyleft "contamination" risk to the proprietary codebase.

---

## 2. License Distribution (full dependency tree)

Across all 744 scanned package manifests (direct + transitive):

| Count | License | Category | Commercial use |
|---|---|---|---|
| 431 | MIT | Permissive | Yes |
| 200 | Apache-2.0 | Permissive (+ patent grant) | Yes |
| 47 | LINE Developers Agreement ("SEE LICENSE IN README.md") | Vendor / non-OSI (all are `@line/liff` + `@liff/*`) | Yes, per LINE terms |
| 37 | ISC | Permissive | Yes |
| 12 | BSD-2-Clause | Permissive | Yes |
| 5 | BSD-3-Clause | Permissive | Yes |
| 3 | MPL-2.0 | Weak (file-level) copyleft | Yes (unmodified) |
| 3 | BlueOak-1.0.0 | Permissive | Yes |
| 1 | LGPL-3.0-or-later | Weak (library) copyleft | Yes (unmodified, dynamically linked) |
| 1 | Python-2.0 | Permissive | Yes |
| 1 | CC-BY-4.0 | Permissive (attribution) | Yes |
| 1 | CC0-1.0 | Public-domain dedication | Yes |
| 1 | Public domain | Public domain | Yes |
| 1 | 0BSD | Permissive (no attribution required) | Yes |

Permissive licenses account for the overwhelming majority; the only copyleft entries are 3x MPL-2.0 and 1x LGPL-3.0 (all transitive, used as unmodified libraries). No GPL/AGPL/SSPL anywhere.

---

## 3. Direct Dependencies - License Table

All 36 direct dependencies (production + development) and their installed license. Every one is permissive OSI open source except the LINE LIFF SDK (vendor license).

| Package | License | Commercial use |
|---|---|---|
| next | MIT | Yes |
| react | MIT | Yes |
| react-dom | MIT | Yes |
| tailwindcss | MIT | Yes |
| @tailwindcss/postcss | MIT | Yes |
| lucide-react | ISC | Yes |
| @supabase/supabase-js | MIT | Yes |
| mongodb | Apache-2.0 | Yes |
| @upstash/redis | MIT | Yes |
| @vercel/blob | Apache-2.0 | Yes |
| @google/generative-ai | Apache-2.0 | Yes |
| openai | Apache-2.0 | Yes |
| @line/bot-sdk | Apache-2.0 | Yes |
| @line/liff | LINE Developers Agreement (vendor) | Yes, per LINE terms |
| @line/liff-mock (dev) | Not installed in tree (confirm; LINE-published, likely Apache-2.0) | Confirm |
| puppeteer | Apache-2.0 | Yes |
| @sparticuz/chromium | MIT | Yes |
| html2canvas | MIT | Yes |
| qrcode | MIT | Yes |
| react-signature-canvas | Apache-2.0 | Yes |
| browser-image-compression | MIT | Yes |
| bcrypt | MIT | Yes |
| axios | MIT | Yes |
| dotenv | BSD-2-Clause | Yes |
| typescript | Apache-2.0 | Yes |
| eslint | MIT | Yes |
| eslint-config-next | MIT | Yes |
| @eslint/eslintrc | MIT | Yes |
| tsx | MIT | Yes |
| baseline-browser-mapping | Apache-2.0 | Yes |
| @types/* (node, react, react-dom, qrcode, bcrypt, html2canvas) | MIT | Yes |

---

## 4. License Categories Explained (permits / requires / commercial use)

| License | Commercial use | Modify / distribute | Core obligations |
|---|---|---|---|
| MIT | Yes | Yes | Preserve the copyright notice and license text |
| ISC | Yes | Yes | Preserve notice (functionally equivalent to MIT) |
| BSD-2-Clause / BSD-3-Clause | Yes | Yes | Preserve notice; 3-Clause adds a no-endorsement clause |
| 0BSD | Yes | Yes | None (attribution not even required) |
| Apache-2.0 | Yes | Yes | Preserve notices; include the LICENSE and any NOTICE file; state significant changes; includes an explicit patent grant (a benefit) |
| BlueOak-1.0.0 | Yes | Yes | Permissive; preserve notices |
| CC0-1.0 / Public domain | Yes | Yes | None |
| Python-2.0 | Yes | Yes | Permissive; preserve notice |
| CC-BY-4.0 | Yes | Yes | Attribution (typically applies to data/content, not code) |
| MPL-2.0 | Yes | Yes | File-level copyleft: if you modify an MPL-licensed source file, you must make that file's source available - it does NOT affect files you author yourself |
| LGPL-3.0-or-later | Yes | Yes | Library copyleft: using the unmodified library (especially dynamically) is fine; if you modify the library or static-link it, you must allow users to relink/replace it and share modifications to the library |
| LINE Developers Agreement | Yes (intended) | Per LINE terms | Vendor/platform terms - governed by LINE's agreement, not an OSI license; review for any restrictions |

The licenses dominating Astly's tree (MIT, Apache-2.0, BSD, ISC) share one practical obligation: retain attribution (copyright and license notices), and for Apache-2.0 also carry forward any NOTICE file and note modifications. None restrict commercial use or require open-sourcing Astly's own code.

---

## 5. Copyleft and Restrictive Components (detailed)

Only four transitive components carry copyleft licenses, all weak/file-level and all used as unmodified libraries:

| Component | License | What it is | Commercial-use conclusion |
|---|---|---|---|
| `@img/sharp-libvips-darwin-arm64` | LGPL-3.0-or-later | A platform-specific prebuilt binary of libvips, used by `sharp` (Next.js image optimization) | Commercial use permitted. LGPL obligations trigger only if libvips itself is modified or statically linked in a way preventing replacement; here it is used as an unmodified, dynamically-loaded native library. No effect on Astly's code. (If image optimization is unused, the dependency can be excluded entirely.) |
| `lightningcss` | MPL-2.0 | A CSS transformer used by Tailwind v4 / the build pipeline | Commercial use permitted. MPL is file-level copyleft: obligations apply only if Astly modifies lightningcss's own source files (it does not). |
| `lightningcss-darwin-arm64` | MPL-2.0 | Native binary for lightningcss | Same as above |
| `axe-core` | MPL-2.0 | Accessibility-rules engine (transitive, development/tooling) | Commercial use permitted; not shipped to end users; MPL file-level obligations do not reach Astly's code |

Conclusion: none of these impose any obligation on Astly's proprietary source code or its hosted service. They are standard, widely-used components in commercial Next.js/Tailwind applications. The absence of any GPL/AGPL/SSPL component means there is no risk of a "network copyleft" obligation (which AGPL/SSPL would impose on a hosted service).

---

## 6. Vendor / Non-OSI Licenses (LINE LIFF)

The 47 "SEE LICENSE IN README.md" entries are entirely the LINE LIFF SDK: `@line/liff` and its `@liff/*` sub-modules. Their README states: "Using LIFF means you agree to the LINE Developers Agreement" (terms2.line.me/LINE_Developers_Agreement).

- Nature: this is a vendor/platform SDK, not an OSI open-source license. It is published by LINE on npm for building LINE mini-apps and is integral to the product (the platform runs as LINE LIFF apps).
- Commercial use: building commercial applications on the LINE platform is the SDK's intended use; however, the terms are LINE's, not an open-source grant.
- Action: review the LINE Developers Agreement for any restrictions (data use, branding, termination) as part of platform-dependency diligence. Note the separate `@line/bot-sdk` (Messaging API) IS Apache-2.0.
- `@line/liff-mock` (a dev-only LIFF mock) was not present in the scanned tree; confirm its license (LINE-published, expected permissive) if it is reintroduced.

---

## 7. Compliance Obligations and How to Meet Them

Even with a permissive tree, a few obligations must be satisfied:

1. Attribution / notices (MIT, BSD, ISC, Apache-2.0): preserve the upstream copyright and license texts. Practical step: generate and ship a third-party notices file (e.g., `THIRD-PARTY-NOTICES.txt`) bundling the license texts of all distributed dependencies. Client-shipped code (the browser bundle) is where attribution matters most; server-only dependencies have lighter practical exposure but should still be inventoried.
2. Apache-2.0 NOTICE files: if a dependency ships a NOTICE file, carry it forward; note any modifications made to Apache-licensed code.
3. LGPL (libvips): keep the library replaceable/dynamically linked (do not modify or statically embed); document that it is used unmodified.
4. MPL-2.0 (lightningcss/axe-core): do not modify the MPL-licensed source files; if ever modified, publish those file changes.
5. LINE Developers Agreement: review and comply with LINE's platform terms.
6. Process: add an automated license scan to CI (license-checker / FOSSA / Syft) with a policy that fails the build on any GPL/AGPL/SSPL or unknown license, so the permissive posture is continuously enforced as dependencies change.

---

## 8. Commercial-Use Assessment

Overall: YES - the platform's open-source dependencies permit full commercial use.

- Use, modification, and commercial operation are allowed across the entire tree.
- No license requires Astly to disclose, open-source, or share its proprietary application code or its hosted service. The absence of AGPL/SSPL specifically means the network/SaaS-copyleft trap does not apply.
- The only obligations are attribution (preserve notices) and the narrow, unmodified-use conditions of the four weak-copyleft transitive components - all already satisfied by using them as-is.
- The one item requiring separate review is the LINE LIFF vendor agreement, which is a platform-terms question rather than an open-source-license risk.

Residual diligence items: produce the third-party notices file, add the CI license gate, and review the LINE Developers Agreement (Section 10).

---

## 9. Forward-Looking: Licensing the In-House AI Model

The roadmap includes an in-house, open-source condition-assessment model (`SYSTEM_ARCHITECTURE.md` Section 14). Two license considerations apply when that work begins, and are flagged now for diligence:

1. Base-model / pretrained-weights license: if the in-house model fine-tunes open vision/VLM weights (e.g., DINOv2, SigLIP, ConvNeXt, Qwen-VL, InternVL, PaliGemma), the license of those base weights must be verified for commercial use - some open model weights carry non-commercial or restricted-use licenses (research-only, or use-based restrictions), which differ from permissive code licenses. Choose base weights under genuinely commercial-friendly licenses (e.g., Apache-2.0 / MIT-style) and record the provenance.
2. Astly's own model release license: when publishing the model as open source, select an explicit permissive license (Apache-2.0 recommended for the patent grant) for the code, and a clear, commercially-usable license for the released weights, with documented dataset provenance and PDPA-compliant training data (see `DATA_PRIVACY_COMPLIANCE.md`).

These are not current dependencies but are the most likely future license-due-diligence questions and should be planned for.

---

## 10. Risk Register and DD Checklist

| # | Item | Severity | Action |
|---|---|---|---|
| L1 | No third-party attribution/notices file shipped | Low-Medium | Generate `THIRD-PARTY-NOTICES` and include license texts |
| L2 | No automated license gate in CI | Medium | Add a scanner that fails on GPL/AGPL/SSPL/unknown |
| L3 | LINE LIFF governed by a vendor agreement (non-OSI) | Low-Medium | Review the LINE Developers Agreement for restrictions |
| L4 | `openai` pinned to `latest` - resolved license can drift with version | Low | Pin the version; the lockfile records the exact resolved license |
| L5 | Future in-house model base-weights license unverified | Medium (future) | Verify commercial-use license of any pretrained weights |
| L6 | LGPL/MPL components must remain unmodified to retain the simple compliance posture | Low | Document "used unmodified"; revisit if ever forked |

DD checklist (data-room items): the generated third-party notices file; a current license-scan report (license-checker/FOSSA output) from the committed lockfile; confirmation of the CI license gate; the LINE Developers Agreement review; and, for the future model, the base-weights and dataset license/provenance record.

---

## 11. Appendix - Full Direct-Dependency Detail and Caveats

Installed versions and licenses are as resolved by the committed `package-lock.json` at scan time (mid-2026). Notable resolved facts: `react`/`react-dom` 19.1.0 (MIT); `next` 16.2.4 (MIT); `@vercel/blob` 2.6.1 (Apache-2.0); `openai` 6.16.0 (Apache-2.0); `typescript` 5.9.3 (Apache-2.0). The LINE LIFF family (`@line/liff` 2.27.2 and 46 `@liff/*` modules) resolves to the LINE Developers Agreement.

Caveats:
- The scan reads each package's declared `license` field; a declared field can occasionally differ from the actual LICENSE file - a dedicated scanner (FOSSA/Syft) cross-checks file contents and is recommended for the formal report.
- Transitive dependencies change as versions update; re-run the scan on each significant dependency change and keep the lockfile authoritative.
- This report covers software dependency licenses only; it does not cover fonts, images, or other assets, which should be inventoried separately if any are bundled.

All findings are informational and should be validated with a dedicated license scanner and, where license-sensitive, with counsel.
