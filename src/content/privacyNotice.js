"use strict";

// The UniLink Privacy Notice. Served by GET /api/legal/privacy so the website and the mobile app show exactly the same
// text and a wording change never needs an app build (same pattern as the Community Standards).
//
// STATUS: DRAFT. Every factual statement below was checked against the code on 24 Oct 2026, and
// tests/legal.content.test.js fails if the code drifts away from it (a new provider SDK, a change to what account
// deletion erases). It has NOT been reviewed by a lawyer. {{PLACEHOLDERS}} are details only the owner can supply; until
// they are set the served text shows "[Owner to provide: ...]" and the notice reports itself as incomplete.
//
// IMPORTANT: bump `version` whenever the meaning changes. People acknowledge a specific version and are asked again
// when it moves on.
//
// Block types: { p: "paragraph" } or { ul: ["item", ...] }.

module.exports = {
  version: "1.0",
  effectiveDate: "2026-10-24",
  title: "UniLink Privacy Notice",
  intro:
    "This notice explains, in plain language, what personal information UniLink handles, why, who can see it, who helps us " +
    "run the service, how long we keep it, and what choices you have. It applies to the UniLink website and the UniLink mobile app.",
  sections: [
    {
      id: "who", number: 1, title: "Who is responsible for your information",
      blocks: [
        { p: "UniLink by Exile is run by {{OPERATOR_NAME}} (“we”, “us”). We decide why and how your personal information is used, which under Kenya’s Data Protection Act, 2019 generally makes us the “data controller”." },
        { ul: [
          "Contact for privacy questions and requests: {{CONTACT_EMAIL}}",
          "Address: {{POSTAL_ADDRESS}}",
          "Data protection officer: {{DPO_CONTACT}}",
          "Registration with the Office of the Data Protection Commissioner (ODPC): {{ODPC_REGISTRATION}}",
        ] },
      ],
    },
    {
      id: "collect", number: 2, title: "What information we collect",
      blocks: [
        { p: "Needed to create an account: your name, university email address, a password (we store only a one-way hash of it, never the password itself) and the university you choose." },
        { p: "Optional or added later: your admission number, phone number, username, bio, profile and cover photos, and your campus, course, programme, year of study and semester." },
        { p: "What you create: posts, comments, messages, club and community activity, assignments and submissions, files you upload, marketplace and lost-and-found listings, and event check-ins." },
        { p: "Safety features: if you add trusted contacts, we store each contact’s name, phone number and relationship to you. If you send an emergency or help report, we store its type, your message, the location you type in, and the notes and actions of the staff who handle it. UniLink does not read your device’s GPS location." },
        { p: "Moderation: reports you make, reports made about your content, the actions taken, and which version of the Community Standards you accepted." },
        { p: "Your device and sessions: on the mobile app, a push-notification token and a login session kept in your phone’s secure storage; the app also keeps a temporary offline copy of some screens on your phone so they still show without signal. On the website, your login session is kept in your browser’s local storage." },
        { p: "A record of this notice: which version you confirmed you had read, when, and whether it was on the website or the app." },
        { p: "What we do not collect: UniLink does not currently use third-party analytics or advertising trackers, and the app does not ask for access to your contacts or your device’s GPS location." },
      ],
    },
    {
      id: "why", number: 3, title: "Why we use it, and the legal reason",
      blocks: [
        { p: "Kenya’s Data Protection Act, 2019 requires a lawful reason for each use of personal information. The reasons below are our current assessment and are being confirmed with a Kenyan lawyer; we will update this notice if that changes them." },
        { ul: [
          "Running your account (signing you in, showing your courses, messages and community): because you have asked to use the UniLink service.",
          "Keeping UniLink secure and safe (preventing abuse, handling reports, enforcing the Community Standards): because it is necessary to protect you, other people and the service.",
          "Notifications: only if you allow them on your phone. You can switch them off in your phone’s settings at any time.",
          "Emergency alerts to your trusted contacts: only when you trigger an alert, because you have asked us to.",
          "The AI assistant: only when you choose to use it.",
          "Meeting legal obligations: where the law requires us to keep or share information.",
        ] },
      ],
    },
    {
      id: "sharing", number: 4, title: "Who can see your information",
      blocks: [
        { p: "People at your university can see what you choose to share on UniLink, such as your name, role, profile photo, posts and comments. Messages are visible to the people in the conversation. Emergency and help reports are visible to the staff authorised to handle them, and the most sensitive kinds are restricted further. Administrators can see the account information and reports they need to run UniLink and keep it safe." },
        { p: "We do not sell your personal information." },
      ],
    },
    {
      id: "processors", number: 5, title: "Companies that help us run UniLink",
      blocks: [
        { p: "These companies handle information on our behalf and for the purposes below:" },
        { ul: [
          "Render: runs our server software.",
          "Our database hosting provider: stores accounts, posts, messages and reports.",
          "Our website hosting provider: serves the UniLink website.",
          "Cloudinary: stores images and files you upload.",
          "Brevo: sends verification and login-code emails (it receives your email address and the message).",
          "Twilio: sends SMS alerts to your trusted contacts when you trigger an emergency alert (it receives the contact’s phone number and a message containing your name and the location text you gave).",
          "Expo: delivers push notifications to your phone (it receives your device’s push token and the notification text).",
          "Google (Gemini): powers the AI assistant. If you use it, your message and up to your last 10 messages in that conversation (each shortened to 2,000 characters) are sent to Google to produce a reply. Please do not put sensitive personal information into the assistant.",
        ] },
      ],
    },
    {
      id: "transfers", number: 6, title: "Where your information is processed",
      blocks: [
        { p: "Some of these companies process information outside Kenya. Where our server, database and file storage run: {{HOSTING_LOCATIONS}}. When information leaves Kenya we rely on the safeguards Kenya’s Data Protection Act requires, which we are confirming with each provider." },
      ],
    },
    {
      id: "retention", number: 7, title: "How long we keep it",
      blocks: [
        { p: "Your account information is kept while your account exists. Safety reports, moderation records and backups are kept for: {{RETENTION_PERIODS}}." },
        { p: "We have not yet set an automatic expiry for posts, messages and uploaded files. They stay until they are deleted or until your account is anonymised as described in the next section." },
      ],
    },
    {
      id: "deletion", number: 8, title: "Deleting your account",
      blocks: [
        { p: "In the UniLink app, go to Settings and choose Delete my account; you will need to enter your password. The website does not have this option yet; until it does, email {{CONTACT_EMAIL}} and we will help." },
        { p: "What is erased: your name is replaced with “Deleted User”, and your email address, photo links, bio, phone number, admission number and trusted contacts are removed from your account. Your push token is removed and you are signed out everywhere." },
        { p: "What stays:" },
        { ul: [
          "Your username, and the university, campus, course, programme, year and semester on the account, stay attached to the anonymised account.",
          "Posts, comments and messages you wrote stay, shown as “Deleted User”, because other people’s conversations depend on them.",
          "Files you uploaded, such as photos and documents, are held by our file storage provider and are not automatically deleted when you delete your account.",
          "Safety and moderation records may be kept as described in the section on how long we keep information.",
          "Copies held in our providers’ backups can take longer to disappear.",
        ] },
        { p: "Staff and administrator accounts cannot delete themselves in the app; a senior administrator removes them." },
      ],
    },
    {
      id: "rights", number: 9, title: "Your rights and how to use them",
      blocks: [
        { p: "Under Kenya’s Data Protection Act, 2019 you have rights over your personal information, including the right to be told how it is used, to see it, to object to its use, to have wrong or misleading information corrected, and to have it deleted in the situations the law sets out." },
        { p: "To use these rights, email {{CONTACT_EMAIL}}. Right now we handle these requests by hand. The only self-service tools are editing your profile and, in the app, deleting your account. We will reply as quickly as we can and within the time the law requires." },
        { p: "If you are not satisfied, please tell us first. You also have the right to complain to the Office of the Data Protection Commissioner (ODPC) in Kenya: https://www.odpc.go.ke" },
      ],
    },
    {
      id: "age", number: 10, title: "Age",
      blocks: [
        { p: "UniLink is intended for students and staff of universities and colleges. {{AGE_POLICY}}" },
      ],
    },
    {
      id: "security", number: 11, title: "Security",
      blocks: [
        { p: "Passwords are stored only as one-way hashes, connections to UniLink are encrypted, and your login session lives in your phone’s secure storage (app) or your browser (website). No system is perfectly secure, so please use a strong password you do not use anywhere else. If a security incident affects your information, we will tell you and the regulator as the law requires." },
      ],
    },
    {
      id: "changes", number: 12, title: "Changes to this notice",
      blocks: [
        { p: "We will update this notice when what we do changes. Each version has a number and a date. When a change matters, we will ask you to confirm that you have read the new version, and we keep a record of which version you confirmed and when." },
        { p: "Confirming that you have read this notice is not the same as agreeing to optional uses of your information. Where we need your consent for something optional, we will ask you separately, and you will be able to withdraw it." },
      ],
    },
    {
      id: "contact", number: 13, title: "Contact",
      blocks: [
        { p: "Questions about your information: {{CONTACT_EMAIL}}." },
      ],
    },
  ],
};
