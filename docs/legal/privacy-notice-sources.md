# Sources checked for the Privacy Notice (DRAFT, not legal advice)

Date checked: 24 Oct 2026. "Confirmed" means I saw the provision named in an official or authoritative copy. "Not confirmed" means I am relying on memory or a secondary summary and a lawyer must verify it.

| Source | Provision | What it requires (paraphrased) | Applies to UniLink because | Implementation | Status |
|---|---|---|---|---|---|
| Data Protection Act, No. 24 of 2019 (ODPC copy: odpc.go.ke/wp-content/uploads/2024/02/TheDataProtectionAct__No24of2019.pdf; Kenya Law) | s.25 | Principles of data protection | All processing | Notice drafted around purpose, minimisation, retention, security | Confirmed (heading) |
| same | s.26 | Rights of a data subject (informed, access, object, correction, deletion) | Users are data subjects | Notice section 9; rights handled by email today | Confirmed (heading); exact list to be checked by a lawyer |
| same | s.28 | Collection of personal data (generally directly from the person) | Trusted contacts are collected from the user about a third party | See register LR-006 | Confirmed (heading and ODPC use of it) |
| same | s.29 | Duty to notify: tell people what is collected, why, who receives it, their rights, contacts, security, consequences of not providing it | The notice itself | Notice sections 1 to 13 | Confirmed (heading and ODPC decisions applying it) |
| same | s.30 and s.32 | Lawful processing; conditions for consent | Each purpose needs a lawful basis; consent must be specific and withdrawable | Notice section 3 gives a proposed basis per purpose, flagged for lawyer confirmation; no bundled optional consent | Confirmed (headings) |
| same | s.31 | Data protection impact assessment | Emergency reports and children's data may need one | owner-decisions.md Q6 | Confirmed (heading); applicability not assessed |
| same | s.33 | Processing personal data relating to a child | UniLink may have under-18 users | owner-decisions.md Q4; no age gate built (see LR-003) | Confirmed (heading); detail not checked |
| same | s.43 | Breach notification to the Data Commissioner | Incident response (a later workstream) | Not yet implemented; the deadline must be verified | Confirmed (heading); **deadline not confirmed** |
| same | cross-border transfer provisions (I believe ss.48 to 50) | Transfers outside Kenya need safeguards or consent | Render, Cloudinary, Twilio, Brevo, Expo and Google may process abroad | Notice section 6 states this plainly and flags safeguards | **Not confirmed**: section numbers and conditions to be verified |
| Data Protection (General) Regulations, 2021, L.N. 263 of 2021 (Kenya Law) | reg.4, reg.5 | Consent conditions; where different legal bases are used the controller must distinguish between them and respond to rights requests | Notice distinguishes purposes and bases | Confirmed (text seen for reg.5) |
| Data Protection (Registration of Data Controllers and Data Processors) Regulations, 2021 | registration | Whether UniLink must register with the ODPC | Unknown: depends on size, sector and data processed | owner-decisions.md Q2 | **Not checked** |
| ODPC determination, Annsalome Wangari and Jaytie Sichiri v Zerox Technology Company Limited (CIPIT case law library) | applying ss.26, 28, 29 | ODPC found a breach where a company used people's contact details as emergency contacts or guarantors without notifying them or having their consent | UniLink stores and texts trusted contacts, who are third parties | See register LR-006 | Confirmed (summary read); not a binding rule on UniLink |

Not researched in this pass (later workstreams): consumer protection and e-commerce rules for the marketplace; Copyright Act and platform obligations; cybercrime, defamation and online-safety rules; rules on emergency information.
