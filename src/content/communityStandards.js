"use strict";

// The UniLink Community Standards. Served by GET /api/safety/standards so the website and the
// mobile app render exactly the same text, and so a wording change never needs an app build.
//
// IMPORTANT: bump `version` whenever the meaning of a rule changes. People accept a specific
// version (User.standardsAcceptedVersion) and are asked to accept again when it moves on.
// This is a plain-language draft: have it reviewed by someone qualified, especially the
// child-safety, legal-reporting and privacy sections, before relying on it.

module.exports = {
  version: "1.0",
  effectiveDate: "2026-10-05",
  title: "UniLink Community Standards",
  intro:
    "UniLink is a space for students, lecturers and staff to learn, connect and look out for each other. " +
    "These standards say what is and is not allowed, how to report a problem, what happens when someone " +
    "breaks the rules, and how to appeal. They apply to everything on UniLink: profiles, posts, comments, " +
    "photos, videos, messages, communities, events and academic resources.",
  sections: [
    {
      id: "respect-harassment", number: 1, title: "Respect and harassment",
      summary: "Disagree as much as you like. Do not target people.",
      rules: [
        "Do not bully, humiliate, mock or repeatedly contact someone who has asked you to stop.",
        "Do not encourage others to pile on, ignore, or exclude a person.",
        "Do not post or share content meant to shame someone, including edited images and screenshots taken to embarrass them.",
        "Criticising ideas, courses or public decisions is fine. Attacking the person is not.",
      ],
    },
    {
      id: "hate-discrimination", number: 2, title: "Hate speech and discrimination",
      summary: "Everyone on campus belongs here.",
      rules: [
        "Do not attack, demean or dehumanise people because of their ethnicity, tribe, race, nationality, religion, gender, sexual orientation, disability, age or health.",
        "Do not use slurs, stereotypes or symbols that promote hatred.",
        "Do not treat people unfairly in groups, clubs or opportunities because of who they are.",
        "Quoting hateful language to condemn it or to report it is allowed, if you make that purpose clear.",
      ],
    },
    {
      id: "threats-violence", number: 3, title: "Threats and violence",
      summary: "Threats are never a joke on UniLink.",
      rules: [
        "Do not threaten to hurt, kill or intimidate anyone, or to damage their property.",
        "Do not encourage, celebrate or glorify violence, or share content that does.",
        "Do not organise or call for violent acts, fights or attacks.",
        "If someone is in immediate danger, contact your local emergency number (for example 999 or 112 in Kenya) and campus security first, then report it here.",
      ],
    },
    {
      id: "sexual-content", number: 4, title: "Sexual content and exploitation",
      summary: "Keep UniLink free of sexual content and sexual pressure.",
      rules: [
        "Do not post sexually explicit images, videos or text.",
        "Do not sexually harass anyone, send unwanted sexual messages, or pressure anyone for sexual favours, including in exchange for grades, money or opportunities.",
        "Do not share or threaten to share intimate images of someone without their consent.",
        "Do not use UniLink to arrange or advertise sexual services or to exploit people.",
      ],
    },
    {
      id: "child-safety", number: 5, title: "Child safety",
      summary: "Zero tolerance for child sexual abuse and exploitation.",
      rules: [
        "Any sexual content involving a person under 18, including images, video, text, drawings and links, is strictly forbidden. This includes child sexual abuse material (CSAM) and any sexual or grooming behaviour toward a minor (CSAE).",
        "Do not ask a minor for sexual content or contact, and do not try to meet a minor for sexual purposes.",
        "Do not share, request, trade or link to such material, even to ask where it came from.",
        "We remove this content immediately, permanently close the accounts involved, preserve evidence, and may report it to law enforcement or other competent authorities. There is no warning first and no appeal for sharing this material.",
        "If you see it, report it as 'Child safety' straight away. Do not download, forward or screenshot it. Do not investigate yourself.",
      ],
      note: "Reports in this category are always handled first and are seen only by a small number of senior reviewers.",
    },
    {
      id: "privacy-doxxing", number: 6, title: "Privacy violations and doxxing",
      summary: "Do not expose people's private lives.",
      rules: [
        "Do not post someone's private information without their consent: home address, phone number, ID or admission number, results, medical details, or private photos.",
        "Do not share private messages or screenshots of private conversations in order to expose, shame or harm someone.",
        "Do not track, stalk or secretly record people.",
        "Do not encourage others to find or contact someone's private details.",
      ],
    },
    {
      id: "impersonation", number: 7, title: "Impersonation and fake accounts",
      summary: "Be who you say you are.",
      rules: [
        "Do not pretend to be another student, lecturer, staff member, official or organisation.",
        "Do not run fake or parody accounts that could mislead people about who is speaking.",
        "Do not create accounts to get around a suspension or a restriction.",
        "Use your real name and your own university identity when you register.",
      ],
    },
    {
      id: "fraud-scams", number: 8, title: "Fraud and scams",
      summary: "No deceiving people out of money, data or accounts.",
      rules: [
        "Do not run scams, fake giveaways, advance-fee schemes, fake job or scholarship offers, or pyramid schemes.",
        "Do not sell items or services you do not have, or take payment without delivering.",
        "Do not phish for passwords, one-time codes or banking details.",
        "Be careful with the marketplace: meet in public places and never share a code sent to your phone.",
      ],
    },
    {
      id: "spam-abuse", number: 9, title: "Spam and platform abuse",
      summary: "Keep UniLink useful.",
      rules: [
        "Do not post the same message, link or promotion over and over, or send unwanted bulk messages.",
        "Do not use bots, scripts or other automated ways to post, like, follow or message.",
        "Do not try to break, overload or bypass UniLink's security or features.",
        "Do not sell, buy or trade accounts, followers or likes.",
      ],
    },
    {
      id: "academic-integrity", number: 10, title: "Academic integrity",
      summary: "Learn honestly and help others do the same.",
      rules: [
        "Do not share, sell or ask for exam papers, answers or assessment questions before or during an assessment.",
        "Do not buy, sell or offer to write assignments, projects or dissertations to be submitted as someone else's work.",
        "Do not use UniLink to organise cheating, impersonation in exams, or tampering with results or attendance.",
        "Sharing your own notes, study tips and genuinely released past papers is welcome.",
      ],
    },
    {
      id: "copyright-ip", number: 11, title: "Copyright and intellectual property",
      summary: "Share what you have the right to share.",
      rules: [
        "Only upload notes, papers, books, images, music and videos that you created or have permission to share.",
        "Do not upload full copies of textbooks or paid course materials without permission.",
        "Credit your sources. If you are a rights holder and see your work shared without permission, report it as 'Copyright'.",
      ],
    },
    {
      id: "illegal-goods", number: 12, title: "Illegal goods and services",
      summary: "Nothing that is against the law.",
      rules: [
        "Do not buy, sell, promote or arrange illegal drugs, weapons, stolen goods, counterfeit items or forged documents.",
        "Do not offer or ask for services that break the law, such as hacking, fake certificates or fake IDs.",
        "Do not use UniLink to plan or hide a crime.",
      ],
    },
    {
      id: "gambling", number: 13, title: "Gambling and betting",
      summary: "No betting promotion or gambling schemes.",
      rules: [
        "Do not advertise or run betting, gambling, lotteries or 'investment' games with a chance of losing money.",
        "Do not pressure or lure students into gambling or loan schemes.",
        "If gambling is affecting you or a friend, talk to your university counselling service.",
      ],
    },
    {
      id: "dangerous-activities", number: 14, title: "Dangerous activities and self-harm",
      summary: "Look out for one another.",
      rules: [
        "Do not encourage, instruct or glorify self-harm, suicide, eating disorders or dangerous challenges and stunts.",
        "Do not share instructions for making weapons, explosives or harmful substances.",
        "If someone is posting that they may hurt themselves, report it as a 'Safety or self-harm concern' so that someone can reach out. If they are in immediate danger, call your local emergency number (for example 999 or 112 in Kenya).",
        "Talking about your own struggles with care is welcome, and your university counselling service is there to help.",
      ],
    },
    {
      id: "misinformation", number: 15, title: "Harmful or deceptive misinformation",
      summary: "No deliberate falsehoods that put people at risk.",
      rules: [
        "Do not knowingly share false information that could cause real harm: fake health advice, fake emergency alerts, false claims about exams or results, or fake official notices.",
        "Do not fabricate screenshots, documents or quotes to deceive people.",
        "Honest mistakes, opinions and satire that is clearly satire are not violations.",
      ],
    },
    {
      id: "coordinated-abuse", number: 16, title: "Coordinated abuse and manipulation",
      summary: "No working together to harm or game the platform.",
      rules: [
        "Do not organise groups to harass, mass-report, or silence a person or community.",
        "Do not run networks of accounts to manipulate likes, polls, votes, rankings or reports.",
        "Do not file reports you know to be false in order to get someone in trouble. Misusing reporting is itself a violation.",
      ],
    },
    {
      id: "community-rules", number: 17, title: "Community-specific rules",
      summary: "Communities can add rules. They can never remove these ones.",
      rules: [
        "The owner of a community may set extra rules for that community, such as staying on topic or keeping discussion respectful.",
        "Community rules can only be stricter. They can never allow what these Community Standards forbid.",
        "If a community rule and these standards disagree, these standards always win.",
        "Breaking a community's rules can get you removed from that community. Breaking these standards can affect your whole account.",
      ],
    },
    {
      id: "moderator-responsibilities", number: 18, title: "Administrator and moderator responsibilities",
      summary: "Those who enforce the rules are held to them.",
      rules: [
        "Moderators must act fairly, consistently and only for the reasons set out in these standards.",
        "Moderators must not use their powers for personal disputes, favours, or to settle scores.",
        "Moderators must keep reports and reporters confidential, and look at private information only as far as needed to decide a case.",
        "Moderators must step back from any case involving themselves, family or close friends, and pass it to someone else.",
        "Every moderation action is recorded with who did it, when, and why, and can be reviewed.",
      ],
    },
    {
      id: "reporting", number: 19, title: "How to report",
      summary: "If something is wrong, tell us.",
      rules: [
        "You can report profiles, posts, comments, videos, messages, communities, events, uploaded files and academic resources from the report option on each one.",
        "Choose the category that fits best and add details if you can. You do not have to be sure that it breaks the rules.",
        "Your identity is not shown to the person you report.",
        "You will get a reference number and can follow the progress of your report.",
        "Reports about child safety and credible, immediate danger are reviewed first.",
        "Please report in good faith. Repeated false or abusive reports can lead to limits on your ability to report.",
      ],
    },
    {
      id: "enforcement", number: 20, title: "What happens when the rules are broken",
      summary: "Responses are proportionate, and some cases are urgent.",
      rules: [
        "Depending on the seriousness, what was intended and any previous history, we may: send a warning; remove content; restrict features such as posting, messaging or uploading; suspend an account for a period; or permanently close an account.",
        "Serious cases, such as child safety or credible threats, can go straight to the strongest action without earlier warnings.",
        "Content may be hidden while it is being reviewed if it appears to be seriously harmful.",
        "We keep the records needed to enforce these standards, to handle appeals, and where the law requires.",
      ],
    },
    {
      id: "appeals", number: 21, title: "Appeals",
      summary: "If you think we got it wrong, you can ask us to look again.",
      rules: [
        "If action is taken against your account or content, you will be told what was done and why.",
        "You can appeal within 30 days. Explain what you think was wrong and add anything we should know.",
        "Your appeal is reviewed by someone who was not involved in the original decision.",
        "You will be told the decision and the reason. If we got it wrong, the action is reversed.",
        "A suspended or closed account can still sign in to see its status and send an appeal.",
      ],
    },
    {
      id: "escalation", number: 22, title: "Escalation",
      summary: "Some cases must go to more senior people.",
      rules: [
        "Moderators escalate cases involving child safety, credible threats, possible crimes, legal questions, reports about other administrators, or anything they cannot decide fairly.",
        "Reports about an administrator or moderator are handled by senior reviewers, not by the person reported.",
        "Where required by law, or to protect someone from serious harm, we may share information with law enforcement or other competent authorities.",
      ],
    },
    {
      id: "transparency-responsibilities", number: 23, title: "Transparency and your responsibilities",
      summary: "We will be open about the rules, and we ask the same of you.",
      rules: [
        "These standards are public and can be read without an account.",
        "When they change in a way that matters, we update the version and date at the top and ask you to accept the new version.",
        "You are responsible for what you post, for keeping your password private, and for everything done through your account.",
        "Help keep UniLink safe: be kind, report what you see, and respect the decisions of moderators, while using the appeal process if you disagree.",
      ],
    },
  ],
};
