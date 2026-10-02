import type { BlockMetadata, ConvictionKind, EntryKind, ISODate } from "../domain/types";
import type { VersionInput } from "../storage/repos/convictions";
import { addDays, addMonths, fromISODate, weekStart } from "../domain/dates";

/**
 * The demo journal: nine months of a software engineer deciding whether to leave a
 * stable job for independent consulting. Synthetic throughout. Every date is computed
 * from `today` so the arc always sits in the recent past.
 */

export type SectionKey = "open" | "yesterday" | "sleep" | "gratitude" | "reading" | "prayer" | "conviction" | "closing";

export interface DemoBlock {
  section: SectionKey;
  content: string;
  metadata?: Omit<BlockMetadata, "section">;
}

export interface DemoEntry {
  /** Stable handle so convictions can point at an entry's conviction block. */
  key: string;
  date: ISODate;
  /** Local wall-clock time the entry was written, HH:MM. */
  time: string;
  kind: EntryKind;
  title: string;
  tags: string[];
  favorite: boolean;
  blocks: DemoBlock[];
}

export interface DemoRevision {
  /** Entry whose date/time becomes the version's createdAt. */
  entryKey: string;
  patch: Partial<VersionInput>;
}

export interface DemoConviction {
  kind: ConvictionKind;
  /** Entry whose conviction block is the source of version 1. */
  entryKey: string;
  version: Partial<VersionInput>;
  revisions: DemoRevision[];
}

export interface DemoReview {
  weekStart: ISODate;
  /** Written the Sunday evening closing the week. */
  date: ISODate;
  time: string;
  content: string;
}

export interface DemoScript {
  entries: DemoEntry[];
  convictions: DemoConviction[];
  reviews: DemoReview[];
}

const MONTH_NAME = new Intl.DateTimeFormat("en", { month: "long" });

function monthName(date: ISODate): string {
  return MONTH_NAME.format(fromISODate(date));
}

function prayer(items: { text: string; status: "ongoing" | "resolved" | "answered" | "no_longer_relevant" }[]): DemoBlock {
  return {
    section: "prayer",
    content: items.map((i) => `- ${i.text}`).join("\n"),
    metadata: { prayerItems: items },
  };
}

function closing(action: string, done = false): DemoBlock {
  return { section: "closing", content: action, metadata: { action, done } };
}

export function buildDemoScript(today: ISODate): DemoScript {
  // Phase anchors. "January" is eight months back; the arc ends yesterday.
  const p1 = addMonths(today, -8); // wrestling
  const p2 = addMonths(today, -7); // the decision
  const p3 = addMonths(today, -6); // drifting (p3 itself is the 6-months-ago resurfacing hit)
  const p4 = addMonths(today, -5); // reorg, inconsistency, revisions
  const m4 = addMonths(today, -4);
  const m3 = addMonths(today, -3);
  const m2 = addMonths(today, -2);
  const m1 = addMonths(today, -1); // exact 1-month resurfacing hit
  const yesterday = addDays(today, -1);

  const decisionDay = p2;
  const noticeDay = addDays(p4, 9);
  const revisionDay = addDays(p4, 16);
  const firstMonth = monthName(p1);
  const decisionMonth = monthName(decisionDay);
  const noticeMonth = monthName(addMonths(p4, 2));
  const startMonth = monthName(addMonths(m4, 1));

  const entries: DemoEntry[] = [
    // ---------------------------------------------------------------- Month 1
    {
      key: "arithmetic",
      date: p1,
      time: "21:40",
      kind: "daily",
      title: "The thought that won't leave",
      tags: ["work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "Dana walked me through next year's roadmap this morning and somewhere around the third slide about the billing migration I noticed I had stopped listening and was instead doing arithmetic on a notepad: what I pay in rent, what the two freelance evenings last autumn brought in, how many of those evenings would make a month. I have done this arithmetic before. What is different is that I did it in a meeting, in front of her, without noticing I had started.\n\nIt is not that the work is bad. The platform team is competent and I am paid well for a city this size. It is that I can see the next three years from here with uncomfortable precision, and none of the surprises in them are mine.",
        },
        {
          section: "yesterday",
          content:
            "Priya asked last night, not unkindly, whether I was going to keep talking about this or do something about it. I said I was thinking. She said I had been thinking since the summer. She is right and I am irritated that she is right, which is usually how I know.",
        },
        {
          section: "sleep",
          content: "Slept fine. Woke before the alarm with the word \"runway\" in my head, which is a word I dislike.",
          metadata: { sleepQuality: 3, sleepHours: 7 },
        },
        {
          section: "gratitude",
          content:
            "The heating works. Marcus replied to my message within an hour. The river path was empty at seven and the fog sat on the water like it had been poured there.",
        },
        prayer([
          { text: "For honesty with myself about what I actually want, as opposed to what I want to be seen wanting", status: "ongoing" },
          { text: "For Dana, who is carrying more than she lets on", status: "ongoing" },
          { text: "For Priya's mother's results on Thursday", status: "ongoing" },
        ]),
        closing("Say the thing out loud to one person who isn't Priya."),
      ],
    },
    {
      key: "marcus",
      date: addDays(p1, 3),
      time: "22:05",
      kind: "daily",
      title: "Coffee with Marcus",
      tags: ["friends", "consulting", "work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "Marcus has been on his own for two years now and he was careful, I think deliberately careful, not to sell it to me. He said the first six months were the worst stretch of his working life and the eighteen after were the best, and that he could not have told me in advance which of the two he was going to get. He bills roughly what I make now, works fewer hours, and spends what he calls an embarrassing amount of time on invoices and hunting.\n\nThe thing he said that stuck: \"You don't leave a job to become a consultant. You leave a job because you've already become one and the job is in the way.\" I asked him whether that was true of me. He said he wasn't going to answer that, which is the kind of friend he is.\n\nPros, as of tonight: the work I'd do is the work I already do in the margins. Two people have asked me, unprompted, whether I take contracts. I have eleven months of expenses saved if I'm generous and nine if I'm honest. Cons: health insurance, the particular loneliness Marcus described of having no one to be annoyed at, the fact that I like the people on the platform team more than I admit, and that I have never once in my life sent an invoice.",
        },
        {
          section: "yesterday",
          content: "Still with me from yesterday: the way Dana said \"we\" about next year's plans, assuming me into them.",
        },
        closing("Write the real number down. Not the hopeful one."),
      ],
    },
    {
      key: "badnight",
      date: addDays(p1, 7),
      time: "06:55",
      kind: "daily",
      title: "",
      tags: ["sleep", "work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "sleep",
          content:
            "Awake from two until nearly five. Not anxious exactly; more like my mind had been handed a problem and refused to put it down. I ran the numbers again in the dark, which is the worst place to run numbers, and they came out worse every time. At one point I was fully convinced I would lose the apartment within a year. At another I was composing the email to Dana. Neither felt like me.",
          metadata: { sleepQuality: 2, sleepHours: 5 },
        },
        {
          section: "open",
          content:
            "Tired and clear in the way that only comes after a bad night. Here is what I think I actually know.\n\nI am not afraid of the work. I am afraid of being the kind of person who leaves something good and then has to explain, at every dinner for the next two years, why it was a good idea. I am afraid of the silence of a Tuesday with no one expecting anything from me. I am afraid of what the money would do to how I pray, whether I would start asking God for clients the way I used to ask for exam results.\n\nWhat I don't know: whether the fear is information or just weather.",
        },
        closing("No decisions on five hours of sleep. Walk at lunch."),
      ],
    },
    {
      key: "ledger",
      date: addDays(p1, 12),
      time: "21:15",
      kind: "daily",
      title: "The ledger",
      tags: ["reading", "faith", "demo"],
      favorite: false,
      blocks: [
        {
          section: "reading",
          content:
            "Chapter three is about the difference between a craftsman and an employee, and it is less flattering to the craftsman than I expected. Her argument: the employee owes the work his hours; the craftsman owes it his judgement, and judgement is expensive precisely because nobody can make you spend it. \"Most people who say they want independence want the freedom to decide. Very few want the obligation to.\"\n\nWhat stood out is that she doesn't frame leaving as brave. She frames it as a ledger: a column of what you owe the work and a column of what the work can owe you back, and the mistake is thinking the second column is what you're deciding about. I have been deciding entirely about the second column.",
          metadata: { source: "The Craftsman's Ledger", reference: "ch. 3, \"What is owed\"" },
        },
        {
          section: "open",
          content:
            "Read the chapter twice on the bus and again in the kitchen. If she's right, the question is not \"should I leave\" but \"what do I owe this work, and can I pay it from inside the company.\" That's a different question and I don't like it as much, because it has an answer I can check.",
        },
        prayer([
          { text: "That I would want the obligation and not only the freedom", status: "ongoing" },
          { text: "For Marcus's daughter, starting at the new school", status: "ongoing" },
          { text: "For Priya's mother's results on Thursday", status: "ongoing" },
        ]),
      ],
    },
    {
      key: "afraid",
      date: addDays(p1, 19),
      time: "20:30",
      kind: "daily",
      title: "What I'm actually afraid of",
      tags: ["work", "faith", "demo"],
      favorite: true,
      blocks: [
        {
          section: "open",
          content:
            "Priya's mother's results came back clear on Thursday. I cried in the car park at work, which surprised me, and then sat in the car for twenty minutes and had the clearest thought I have had about any of this.\n\nI have been treating this decision as if it were about risk. It isn't, or not mostly. I have savings; I have a skill people pay for; I have a partner with a stable job who has said, more than once, that she would rather I tried and failed than kept doing arithmetic at dinner. The risk is real but it's survivable.\n\nWhat I'm actually afraid of is that I'll leave, and it will go fine, and I'll discover that the restlessness comes with me. That the job was never the thing in the way. That's the version I can't plan for, and so I keep planning for the other versions instead.\n\nWriting that down makes it smaller. Not gone. Smaller.",
        },
        closing("Decide something by the end of the month, even if the something is \"not yet\"."),
      ],
    },

    // ---------------------------------------------------------------- Month 2
    {
      key: "decision",
      date: decisionDay,
      time: "07:20",
      kind: "daily",
      title: "A decision, for now",
      tags: ["work", "consulting", "faith", "demo"],
      favorite: true,
      blocks: [
        {
          section: "open",
          content:
            "Woke at six and knew. Not in a dramatic way; more the way you know the kettle has boiled because the noise changed.\n\nI'm going to stay. Through the end of the year at least. And I'm going to build the thing on the side, properly, with a name and a rate and a Saturday morning blocked out, rather than leaving first and building afterwards. Marcus's line about already being a consultant cuts the other way too: if I'm already one, I can prove it from here.\n\nThis isn't the brave choice and I've made peace with that. It's the choice that lets me find out whether the restlessness is about the job without betting the apartment on the answer.",
        },
        {
          section: "yesterday",
          content: "Priya, when I told her: \"Good. Now stop talking about it.\" Then she made eggs.",
        },
        {
          section: "conviction",
          content:
            "I will stay in my current role through the end of the year and build the consulting practice on the side rather than leaving now.\n\nReasoning, so I can't fog it later: the side work will tell me what I need to know. If it grows, I'll know the demand is real and the leaving will be a confirmation, not a gamble. If it doesn't, I will have learned that at the cost of some Saturdays rather than a salary. The two things that would genuinely change this: if the side work gets large enough that staying is costing me more than it protects, say more than forty percent of my salary for three months running; or if the team reorganises and the work turns into pure maintenance, in which case the good job I'm protecting won't exist anymore.",
        },
        closing("Register the business name. Tell Dana nothing yet; there's nothing to tell."),
      ],
    },
    {
      key: "firstsaturday",
      date: addDays(p2, 9),
      time: "17:45",
      kind: "daily",
      title: "",
      tags: ["consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "First proper Saturday. Three hours at the kitchen table on the stock-reconciliation script for Lena's shop, which is barely consulting, but she's paying and I sent an invoice, my first, and felt faintly ridiculous typing \"Net 30\". Dana asked on Friday if I was alright; I think I've been quieter. I said I was sleeping badly, which was true a month ago.",
        },
        closing("Follow up with the second enquiry (the clinic). Don't undercharge."),
      ],
    },

    // ---------------------------------------------------------------- Month 3
    {
      key: "skipped",
      date: p3,
      time: "16:30",
      kind: "daily",
      title: "",
      tags: ["consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content: `Skipped the Saturday. Second one in a row, if I'm counting, and I am. Lena's script is done and paid and the clinic went quiet after I sent the rate, and without a live project the kitchen-table hours feel like a performance of a plan rather than a plan. Slept in instead. Walked the river. Felt fine about it until about four in the afternoon, when I didn't.\n\nI wrote in ${decisionMonth} that the side work would tell me what I need to know. It's telling me something. I'm not sure I'm listening to the right part.`,
        },
        closing("Email three people on Monday. Not a pitch, just a question: who do you know who's stuck."),
      ],
    },
    {
      key: "sprint",
      date: addDays(p3, 6),
      time: "07:05",
      kind: "daily",
      title: "Sprint planning",
      tags: ["work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "yesterday",
          content:
            "Sprint planning ran two hours over because the billing migration is being re-scoped for the third time, and I sat there with the feeling I used to get in school assemblies: that my body was in the room and the rest of me had gone somewhere else and would be back later. Dana is doing her best. The best isn't the problem.",
        },
        {
          section: "open",
          content:
            "I notice I'm becoming someone who sighs in meetings. I don't like him. The resentment has a specific flavour: not that the work is beneath me, but that I'm giving the team the version of me that's left over after I've spent the good hours wanting to be elsewhere. That's not fair to them and it's not what I decided.\n\nI keep thinking about leaving in the spring anyway. Not deciding. Thinking. Which I know from experience is how deciding starts.",
        },
        {
          section: "sleep",
          content: "Six hours, broken. Dreamt I was late for something I couldn't name.",
          metadata: { sleepQuality: 3, sleepHours: 6 },
        },
      ],
    },
    {
      key: "honest",
      date: addDays(p3, 13),
      time: "22:20",
      kind: "daily",
      title: "",
      tags: ["faith", "work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "Trying to be honest in prayer tonight instead of tidy. The tidy version is \"help me be patient at work.\" The honest version is that I'm angry at a job for being a job, and ashamed that a decision I made with a clear head six weeks ago feels like a cage now that it costs something. I don't think the decision was wrong. I think I'm finding out what it costs, and I didn't price that in.",
        },
        prayer([
          { text: "For patience that isn't just suppression", status: "ongoing" },
          { text: "For Dana, in a re-scoping she didn't ask for", status: "ongoing" },
          { text: "For the clinic to reply, or for me to stop checking", status: "ongoing" },
          { text: "Priya's mother: clear results, still grateful", status: "answered" },
        ]),
      ],
    },
    {
      key: "referral",
      date: addDays(p3, 20),
      time: "15:10",
      kind: "note",
      title: "",
      tags: ["consulting", "friends", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "Marcus forwarded a referral: a logistics company that wants someone to look at their dispatch system. \"Don't think, reply.\" Haven't replied. It's been four hours.",
        },
      ],
    },

    // ---------------------------------------------------------------- Month 4
    {
      key: "reorg",
      date: p4,
      time: "21:50",
      kind: "daily",
      title: "Reorg",
      tags: ["work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "yesterday",
          content:
            "All-hands. The platform team is being folded into \"core services\", which means the migration work goes to the new team in the other office and we keep the parts nobody wanted to move: on-call, the legacy billing jobs, the integrations that only three people understand. Dana found out on Monday. She told us on Thursday. She looked like she hadn't slept.",
        },
        {
          section: "open",
          content:
            "So. One of the two things I wrote down has happened, almost word for word, and I notice I'm not relieved and not upset but something stranger: alert, the way you are when a forecast you half-believed turns out to be right.\n\nI'm not going to decide anything this week. I wrote the trigger down precisely so I'd take it seriously, and taking it seriously means not acting on it in the same mood I found out in.",
        },
        closing(`Re-read the ${decisionMonth} decision. Reply to Marcus's logistics referral. Both today.`),
      ],
    },
    {
      key: "reconsidering",
      date: addDays(p4, 2),
      time: "07:30",
      kind: "daily",
      title: "Reconsidering",
      tags: ["work", "consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content: `Sat with the ${decisionMonth} entry this morning and it's odd reading yourself from two months ago. He was calmer than I am. He also wrote, in his own words, that if the team became maintenance-only the good job he was protecting wouldn't exist anymore. I don't get to ignore that just because it's inconvenient now that it's true.\n\nNot changing the decision today. Marking it as under review, which is a thing I can do now, apparently, and which feels more honest than either pretending nothing has changed or flipping on a Thursday.`,
        },
        {
          section: "conviction",
          content:
            "The reorg is one of the things I said would change my mind. I'm moving the stay-through-year-end decision to reconsidering rather than reversing it. What I want to know before I do anything: whether the new scope is actually maintenance-only or just looks like it from the announcement, and whether the logistics referral turns into real work.",
        },
        closing("Ask Dana for the actual scope document. Call the logistics company back."),
      ],
    },
    {
      key: "notice",
      date: noticeDay,
      time: "19:40",
      kind: "daily",
      title: "",
      tags: ["work", "demo"],
      favorite: true,
      blocks: [
        {
          section: "open",
          content: `I told Dana today I'm giving notice in ${noticeMonth}.\n\nI didn't plan to. We were in the small meeting room going through the on-call rota for the new scope and she asked, flatly, whether she should be planning for me to be here in the autumn, and I heard myself say no. ${noticeMonth}, probably. She nodded. She said she'd expected it since the all-hands and that she'd rather know. Then we finished the rota.\n\nWalking home I felt sick and light at the same time. I wrote two months ago that I would stay through the end of the year. I meant it. I still think it was right, then. I need to go back and work out whether I just broke a decision or whether the decision already broke itself when the team did.`,
        },
        closing(`Tell Priya before she hears it in my voice. Then sit down with the ${decisionMonth} entry and the numbers.`),
      ],
    },
    {
      key: "revised",
      date: revisionDay,
      time: "08:10",
      kind: "daily",
      title: "The new decision",
      tags: ["work", "consulting", "faith", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content: `Two weeks of doing the sums properly and talking to the logistics people (Henderson: a real company with a real problem and a budget they've actually approved) and the picture is clear enough to write down.\n\nThe reason I decided to stay was to protect good work while I tested demand. The good work is gone; the scope document confirms it; we're a maintenance team with a nicer name. And the demand has shown up on its own: Henderson, the clinic back in touch, Lena's cousin. Both halves of the reasoning have moved. Keeping the conclusion while the reasons walk away would be stubbornness, not faithfulness.\n\nSo: notice in ${noticeMonth}. Four months of expenses saved, which is less than Marcus had and more than I'd have if I waited for the perfect number. Priya is for it. I'm scared in the ordinary way, not the lying-awake way.`,
        },
        {
          section: "conviction",
          content: `Revised: I will give notice in ${noticeMonth} and start consulting full-time with four months of expenses saved. The original decision stands as a record of what I thought and why; I want to be able to read it later without flinching.`,
        },
        {
          section: "gratitude",
          content:
            "Dana, for making it easy when she could have made it hard. Marcus, for the referral and for not saying \"told you so\". The scope document, honestly, for being as bad as I feared; it made this simpler.",
        },
      ],
    },

    // ---------------------------------------------------------------- Months 5–9
    {
      key: "handover",
      date: addDays(m4, 3),
      time: "21:00",
      kind: "daily",
      title: "Handover",
      tags: ["work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "Four weeks left. Writing the handover doc for the billing jobs and discovering how much of what I know lives nowhere but my head: the cron that must not run on the first, the vendor contact who only answers if you cc her manager, the reason the retry queue is backwards. Writing it down is a strange kind of leaving. Each paragraph is a thing the team no longer needs me for.",
        },
        {
          section: "gratitude",
          content:
            "Sam, who asked good questions about the handover instead of nodding. The clear weeks ahead on the calendar, even though they terrify me. The resignation letter, done, and the fact that Dana read it and just said \"okay, good\".",
        },
      ],
    },
    {
      key: "hendersoncall",
      date: addDays(m4, 18),
      time: "12:25",
      kind: "note",
      title: "",
      tags: ["consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content: `Henderson called. They want a proposal by Friday and they want to start in ${startMonth}. Said yes before I'd checked the calendar. There is nothing on the calendar.`,
        },
      ],
    },
    {
      key: "firstmonday",
      date: addDays(m3, 5),
      time: "18:15",
      kind: "daily",
      title: "First Monday",
      tags: ["consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "sleep",
          content:
            "Woke at 5:40 without an alarm, which I haven't set since Friday. First thought: nobody is expecting me anywhere. Second thought: that's the point. Third thought, less welcome: that's also the problem.",
          metadata: { sleepQuality: 3, sleepHours: 6.5 },
        },
        {
          section: "open",
          content:
            "First day working alone. The apartment is very quiet at ten in the morning in a way I'd never noticed, because I'd never been in it at ten in the morning on a weekday. Priya left at eight. I made a second coffee I didn't want, to have something to do with the transition.\n\nHenderson's dispatch code is as bad as promised, which is reassuring; I know how to be useful here. The work part is fine. It's the part between the work, no one to turn to and say \"look at this\", that I can feel already, on day one, like a draught from a door I haven't found yet.",
        },
        closing("Set working hours and keep them. Lunch outside. Message Marcus, not for help, just to say hello."),
      ],
    },
    {
      key: "hendersonsigned",
      date: addDays(m3, 20),
      time: "20:45",
      kind: "daily",
      title: "",
      tags: ["consulting", "work", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "Henderson signed the extension today: eight weeks became twelve, their suggestion, same rate. First time I've been paid for judgement rather than hours and it feels different in the body; I was more tired at four o'clock than I used to be at seven. Good tired. Dana messaged to ask how it was going. I told her the truth: better than I feared and lonelier than I expected.",
        },
        {
          section: "conviction",
          content:
            "Marking the Henderson decision done. Took it, priced it at the number, held the number when they asked. That last part is the one I want to remember.",
        },
      ],
    },
    {
      key: "alone",
      date: addDays(m2, 2),
      time: "21:30",
      kind: "daily",
      title: "On working alone",
      tags: ["consulting", "faith", "demo"],
      favorite: true,
      blocks: [
        {
          section: "open",
          content:
            "I want to write about the loneliness honestly because I've been writing around it for a month.\n\nIt isn't dramatic. I'm not sad, exactly, and the work is going well: Henderson's second phase is on time and the clinic finally signed. It's that I spend eight hours a day making decisions and there is no one to be wrong in front of. At the company I used to resent the review process; now I'd pay for someone to tell me a plan is bad before I've built it. I talk to Priya at dinner and I can hear myself over-explaining, trying to compress a whole day of being unwitnessed into forty minutes.\n\nMarcus said the first six months were the worst of his working life. I assumed he meant money. I think he meant this.\n\nThings that help, so far: the Tuesday co-working morning at the library, which I resisted for weeks and now protect. Walking at lunch. Writing here, which turns out to be a kind of witness. Things that don't: more coffee, podcasts, checking email at eleven at night.",
        },
        prayer([
          { text: "For a colleague, in whatever form that takes", status: "ongoing" },
          { text: "For Henderson's ops team, who are frightened of the changes", status: "ongoing" },
          { text: "For the clinic contract to be good for them and not just for me", status: "ongoing" },
          { text: "Thanks for the library", status: "ongoing" },
        ]),
      ],
    },
    {
      key: "fetch",
      date: addDays(m2, 15),
      time: "17:20",
      kind: "daily",
      title: "Fetch",
      tags: ["reading", "consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "reading",
          content:
            "Hal's point in chapter seven is that the dangerous water isn't the open sea, it's the long stretch of wind over open water before the waves arrive, what sailors call fetch. The waves you meet were made miles behind you by conditions you couldn't see. He uses it as a figure for work: the hard month you're in was built by decisions three months back, and what you do today lands in the autumn.\n\nWhat I want to remember: the fetch runs both ways. The outreach I'm not doing this week is a flat calm I'll pay for later.",
          metadata: { source: "Weather for Small Boats", reference: "ch. 7, \"Fetch\"" },
        },
        {
          section: "open",
          content:
            "Read it on the balcony with the clinic's requirements doc face-down on the table. Then turned the doc over and did the outreach: three emails, one coffee booked. The book paid for itself in an afternoon, which the author would probably find vulgar.",
        },
      ],
    },
    {
      key: "invoice",
      date: m1,
      time: "19:05",
      kind: "daily",
      title: "",
      tags: ["consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content: `First Henderson invoice paid in full, on time, into the business account, and I stood in the kitchen looking at the banking app the way people look at a letter they'd been dreading that turned out to be fine. Four months of expenses saved has become four and a half. The clock I'd been hearing since ${noticeMonth} got quieter.\n\nI also notice I'm proud in a way that's slightly out of proportion to the event, and I'm going to let myself have it today and not tomorrow.`,
        },
        {
          section: "gratitude",
          content:
            "The invoice. Priya, who didn't say anything about the banking app, just squeezed my shoulder. Marcus's eighteen months, which gave me a map. The platform team; I still think about them, and I'm glad I left well.",
        },
        closing("Move two months of the buffer into the savings account so I can't spend it on a feeling.", true),
      ],
    },
    {
      key: "rest",
      date: addDays(m1, 10),
      time: "20:50",
      kind: "daily",
      title: "Rest",
      tags: ["faith", "consulting", "demo"],
      favorite: false,
      blocks: [
        {
          section: "open",
          content:
            "Worked last Sunday and the Sunday before, for Henderson's go-live, and both weeks I was worse on the Wednesday than I'd been on the Friday. I didn't have this problem at the company because the company had weekends built in and I didn't have to defend them. Now every hour is available, which means every hour has to be chosen, and I've been choosing badly.\n\nSo, a rule, and I want it to be a rule and not an intention: one day a week with no client work, no email, no \"just checking\". Not because I've earned it. Because I'm not built for seven days and pretending otherwise is a slow way of making the loneliness worse.",
        },
        {
          section: "conviction",
          content:
            "Weekly rest day is non-negotiable. Sunday, unless a client emergency moves it to Monday, and then it moves, it doesn't vanish.",
        },
        prayer([
          { text: "For the discipline to rest, which turns out to be harder than the discipline to work", status: "ongoing" },
          { text: "For the go-live aftermath to stay quiet", status: "ongoing" },
          { text: "For a colleague; still asking", status: "ongoing" },
        ]),
      ],
    },
    {
      key: "arithmeticnote",
      date: addDays(today, -12),
      time: "21:10",
      kind: "note",
      title: "",
      tags: ["demo"],
      favorite: true,
      blocks: [
        {
          section: "open",
          content: "Priya, over dinner: \"You haven't done the arithmetic in months.\" I hadn't noticed. She had.",
        },
      ],
    },
    {
      key: "pricing",
      date: addDays(today, -5),
      time: "07:35",
      kind: "daily",
      title: "Pricing",
      tags: ["consulting", "sleep", "demo"],
      favorite: false,
      blocks: [
        {
          section: "sleep",
          content: "Up at three, briefly, over the Rowan quote. Back to sleep by four. Progress: the old version of me would have stayed up.",
          metadata: { sleepQuality: 3, sleepHours: 6 },
        },
        {
          section: "open",
          content: `Rowan Studio want a quote for the inventory project and I've rewritten it four times. The number is right; it's the number I wrote down in ${decisionMonth}, adjusted for the fact that I'm now worth more than I thought then. The rewriting is fear wearing a spreadsheet. Henderson held at this rate. The clinic held. Rowan will hold or they won't, and if they won't, that's information about Rowan, not about me.\n\nNoticing too that \"notice\" used to be a word I couldn't say. Dana's name came up in a Henderson meeting today and I felt only fondness.`,
        },
        closing("Send the quote as written. Do not open the spreadsheet again."),
      ],
    },
    {
      key: "yesterday",
      date: yesterday,
      time: "08:00",
      kind: "daily",
      title: "",
      tags: ["consulting", "faith", "demo"],
      favorite: false,
      blocks: [
        {
          section: "yesterday",
          content: `Sunday was a rest day and I kept it. Walked the river path in the morning, the long way, and realised I'd stood at the same stretch of water in ${firstMonth} wondering whether to leave, and in ${decisionMonth} deciding not to, and in ${noticeMonth} knowing I would, and the water didn't care in any of those months, which I found comforting.`,
        },
        {
          section: "open",
          content:
            "Eight months ago I couldn't sit through a roadmap meeting without doing sums. Now I do sums for a living and I sit through my own meetings fine. I don't want to draw a lesson from that too quickly. The restlessness I was afraid would come with me did come, a little. It's just pointed at better things.\n\nThe Rowan quote went out as written. No reply yet. That's alright.",
        },
        closing("Send the Rowan proposal document before noon, then close the laptop until two."),
      ],
    },
  ];

  const convictions: DemoConviction[] = [
    {
      kind: "decision",
      entryKey: "decision",
      version: {
        statement:
          "I will stay in my current role through the end of the year and build the consulting practice on the side rather than leaving now",
        context:
          "After a month of going back and forth: a conversation with Marcus, chapter three of The Craftsman's Ledger, and a bad night in the middle of it. Written the morning it settled.",
        reasoning:
          "The side work will tell me what I need to know before I have to bet on it. If demand is real it will show up in evenings and Saturdays; if it isn't, I'd rather find out while still salaried. Staying also keeps the platform team's work, which I actually like, and lets me leave well instead of suddenly.",
        confidence: 4,
        evidence:
          "Two unsolicited enquiries about contract work in the last quarter. Marcus took eighteen months to feel steady and had more savings than I do. Priya is in favour of trying but not in favour of a cliff.",
        uncertainties:
          "Whether I have the energy to do real work on Saturdays after a full week. Whether \"through the end of the year\" is a plan or a way of postponing. Whether the restlessness is about the job at all.",
        changeTriggers:
          "If side work exceeds 40% of my salary for three consecutive months. If the team reorganises and my role becomes maintenance only. If my health or Priya's changes what risk we can carry.",
        costOfIgnoring: "Another year of arithmetic at dinner. Leaving in a rush, badly, because I didn't test anything first.",
        nextAction: "Register the business name this week and block Saturday mornings on the calendar.",
        ifThen: {
          condition: "a client enquiry comes in during a work week",
          action: "reply within a day and offer evenings or Saturdays, not pretend I can't do it",
        },
        reviewDate: addMonths(decisionDay, 3),
        status: "active",
      },
      revisions: [
        {
          entryKey: "reconsidering",
          patch: {
            status: "reconsidering",
            confidence: 3,
            uncertainties:
              "Whether the new scope is actually maintenance-only or just looks that way from the announcement. Whether Marcus's logistics referral is real work or a favour. Whether I'm reaching for the trigger because it's convenient.",
            nextAction: "Get the real scope document from Dana. Call the logistics company back.",
            changeNote:
              "The team reorganised and the platform work moved to another office, which is one of the two triggers I wrote down. Not reversing yet; I want to see the real scope and whether the referral turns into work before I decide anything.",
          },
        },
        {
          entryKey: "revised",
          patch: {
            statement: `I will give notice in ${noticeMonth} and start consulting full-time with four months of expenses saved`,
            context:
              "Revised after the scope document confirmed the team is now maintenance-only and three real enquiries (Henderson, the clinic, a referral) arrived within a month.",
            reasoning:
              "Both reasons for staying have moved: the good work I was protecting no longer exists, and demand has shown up without me chasing it. Keeping the conclusion when the reasons are gone would be stubbornness. Four months of expenses is enough runway to find out if this works, and Henderson alone covers two of them.",
            confidence: 4,
            evidence:
              "Scope document: on-call, legacy billing, integrations; no new work. Henderson has approved budget and a start date. The clinic came back at the original rate. Priya is for it.",
            uncertainties:
              "Whether four months is enough if Henderson slips. Whether working alone will be bad for me in a way structure can't fix. Whether I'm leaving because the reasons changed or because I wanted to anyway and the reorg gave me cover.",
            changeTriggers:
              "If I can't bill at least two months of expenses in the first four months, I'll look for contract-to-hire work rather than run the savings down. If working alone turns out to be bad for me in a way I can't fix with structure.",
            costOfIgnoring: "Another year in a maintenance role I resent, giving the team the leftover version of me.",
            nextAction: `Draft the Henderson proposal. Write the resignation letter and sit on it until the first of ${noticeMonth}.`,
            ifThen: {
              condition: "a month passes with no billable work",
              action: "spend the first week of the next month on outreach before anything else",
            },
            reviewDate: addMonths(revisionDay, 5),
            status: "active",
            changeNote:
              "Both reasons for the original decision changed: the work I was protecting no longer exists after the reorg, and demand showed up (Henderson, the clinic, a referral) without me chasing it. The original version stays as it was; this is the decision as it stands now.",
          },
        },
      ],
    },
    {
      kind: "decision",
      entryKey: "hendersoncall",
      version: {
        statement: "Take the Henderson contract",
        context: "First real contract offer, arrived the week after I gave notice.",
        reasoning:
          "It's the work I'm good at (a dispatch system nobody understands), the budget is approved, and it covers two months of expenses. Starting with a known problem beats starting with outreach.",
        confidence: 4,
        evidence: "Marcus vouches for them. Scope is bounded: eight weeks, one system.",
        uncertainties: "Whether eight weeks is realistic. Whether I'm underpricing because it's the first one.",
        changeTriggers: "If they want an open-ended retainer, or if they push the rate down more than ten percent.",
        costOfIgnoring: "Starting the practice with an empty calendar and a savings clock ticking.",
        nextAction: `Write the proposal. Price it at the rate I wrote down in ${decisionMonth}, not lower.`,
        ifThen: { condition: "they push back on the rate", action: "reduce scope before I reduce price" },
        reviewDate: addDays(addDays(m4, 18), 21),
        status: "active",
      },
      revisions: [
        {
          entryKey: "hendersonsigned",
          patch: {
            status: "completed",
            reviewDate: null,
            changeNote:
              "Signed, delivered the first phase, extended to twelve weeks at the same rate. Held the price when they asked, which was the part I wasn't sure I'd do.",
          },
        },
      ],
    },
    {
      kind: "conviction",
      entryKey: "rest",
      version: {
        statement: "Weekly rest day is non-negotiable",
        context: "After two consecutive Sundays working on the Henderson go-live and feeling the cost by mid-week both times.",
        reasoning:
          "At the company the week had edges. Now nothing stops unless I stop it, and the cost of not stopping shows up in the work and in how I am at home.",
        confidence: 5,
        evidence: "Two weeks of data, which isn't much, but the pattern matches what I already knew about myself at the company.",
        uncertainties: "Whether I'll hold it when a client is in real trouble. Whether Sunday is the right day or just the default.",
        changeTriggers: "I can't think of anything that would change the principle. What might change is which day.",
        costOfIgnoring: "Burning out the practice in year one and blaming the practice.",
        nextAction: "Tell the clinic and Henderson my working days in writing.",
        ifThen: { condition: "a client emergency lands on the rest day", action: "move the day to Monday, not cancel it" },
        reviewDate: addDays(today, 14),
        status: "active",
      },
      revisions: [],
    },
  ];

  const reviewWeek = weekStart(decisionDay);
  const reviews: DemoReview[] = [
    {
      weekStart: reviewWeek,
      date: addDays(reviewWeek, 6),
      time: "20:15",
      content:
        "## The week I stopped circling\n\nI'd been treating \"leave or stay\" as the question since the autumn, and this week it finally resolved into something I could write in one sentence: stay through the end of the year, build the practice on the side, let the side work tell me what I need to know.\n\n**What helped.** Writing the fear down the week before. Once \"I'm afraid the restlessness comes with me\" was on paper, the decision stopped being about courage and started being about information, and information is something I can gather without quitting.\n\n**What I noticed.** I was lighter with the team this week. Reviewed Sam's migration PR properly instead of rubber-stamping it. Maybe the deciding was the thing, not the direction.\n\n**What I'm watching.** The two triggers I wrote down: forty percent for three months; the team becoming maintenance-only. I want to notice if either happens, rather than discover it afterwards in a mood.\n\n**Prayer.** Priya's mother's results were clear. I keep forgetting to be grateful for things I asked for, once they're answered.\n\n**Next week.** Register the name. Reply to the clinic. Keep the Saturday.",
    },
  ];

  return { entries, convictions, reviews };
}
