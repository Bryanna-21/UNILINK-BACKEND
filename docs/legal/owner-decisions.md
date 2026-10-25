# Decisions only the owner or a Kenyan lawyer can make

Each is a question, not an answer. Until answered, the Privacy Notice shows the matching "[Owner to provide]" marker or a flagged statement.

1. **Operator identity.** Who legally operates "UniLink by Exile": a person, a registered business, or a company? What are the legal name, address and privacy contact?
2. **ODPC registration.** Must UniLink register as a data controller or processor? If yes, what is the registration number?
3. **Lawful basis per purpose.** Confirm or change the proposed basis for each purpose in section 3 of the notice (account service, safety and moderation, notifications, emergency alerts, AI assistant). Is consent needed for any of them?
4. **Minimum age.** What is the minimum age, and are users under 18 allowed? If yes, what guardian-consent mechanism is required for children's data? (The notice has a placeholder; no age gate exists.)
5. **Trusted contacts.** The people added as trusted contacts have not been told and have not agreed. Should they receive a first message telling them they were added and how to opt out? (See LR-006.)
6. **Impact assessment.** Does the emergency-report feature, or any use of children's data, require a data protection impact assessment?
7. **Retention.** How long are safety reports, moderation records and backups kept? Is there a legal retention duty or a legitimate need to keep some records after account deletion?
8. **Providers and transfers.** For Render, the database host, Cloudinary, Brevo, Twilio, Expo and Google: what data-processing terms are in force, where does data run, and what transfer safeguards apply? (Provider-side settings could not be inspected in this pass.)
9. **Deletion scope.** After account deletion, should the username be erased and uploaded files removed from Cloudinary? (Currently neither happens; see LR-001 and LR-002.)
10. **Review status.** When a lawyer has reviewed the notice, set `LEGAL_REVIEW_STATUS=reviewed`.
