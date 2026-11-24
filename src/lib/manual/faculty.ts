import type { ManualPart, ManualQuestion, ManualQuickStart, ManualTerm } from "@/components/Manual";

// The faculty part of the Help page (app/help/page.tsx).

export const QUICK_START: ManualQuickStart[] = [
  { title: "Book a free room", text: "For an extra class or an event.", href: "#request-room" },
  { title: "Can't take a class?", text: "Ask a free colleague, or drop it.", href: "#exchange" },
  { title: "Classes in your calendar", text: "Add your private link once.", href: "#calendar" },
  { title: "Find a meeting time", text: "When everyone you need is free.", href: "#meetings" },
];

export const PARTS: ManualPart[] = [
  {
    id: "start",
    title: "Getting started",
    intro: "What the site is for, how to sign in and how the day is divided into slots.",
    sections: [
      {
        id: "about",
        title: "What the site does",
        intro:
          "The site shows which room is used by whom in every slot of the day, for the Department of Machine Learning. Students can look without signing in. Faculty sign in to request free rooms, hand a class to a colleague and drop a class. The HoD and the Time Table Officers (the admins) approve requests, allot rooms for CIEs and events and keep the timetable up to date.",
        tips: ["Everything you see is live: when an admin approves a request or changes the timetable, the home page, the room weeks and the class timetables change at once."],
      },
      {
        id: "sign-in",
        title: "Signing in",
        where: "Sign in, top right",
        href: "/login",
        intro: "Sign in with your college Google account (@bmsce.ac.in). Only people an admin has put on the department list can sign in.",
        steps: [
          "Press Sign in at the top right, then Continue with Google, and choose your @bmsce.ac.in account. If the Google button doesn't appear, press Use the other sign-in.",
          "You land on My dashboard. Your name and role show in the top bar.",
          "To sign out, press Log out at the top right. Do this on a shared computer.",
        ],
        tips: [
          "\"Your email is not on the faculty or admin list yet\" means an admin has to add you under Sign-in list & names. Ask the HoD or a Time Table Officer.",
          "\"Please sign in with your @bmsce.ac.in college account\" means you picked a personal Gmail account. Choose your college account instead.",
          "Your timetable initials (for example SBM) link you to your classes. If My upcoming classes says your initials are not set, ask an admin to add them.",
        ],
      },
      {
        id: "around",
        title: "Finding your way around",
        intro: "Once you sign in, the menu on the left of every page has all the pages: Rooms & classes for everyone, and My work for your own. On a phone or tablet, press the ☰ button at the top left to open it. Before you sign in, the main pages are in the bar at the top.",
        steps: [
          "Home: every room in the chosen slot, free and busy faculty, notices and what is coming up.",
          "Free slots: every free room for each slot of a day, with filters for seats, kind of room and projector.",
          "Class timetables: each class's regular week, today as it runs, and the changes coming up.",
          "Faculty availability: who is free or busy in each slot, and the best times for a meeting.",
          "My dashboard: your classes, your requests, and colleagues' requests to you.",
          "Request a room: ask for a free room for a class or an event.",
          "Help: this manual.",
        ],
        tips: [
          "The palette button at the top right changes the colour theme, and the sun or moon button switches between light and dark.",
          "The button at the foot of the side menu narrows it to icons, to give wide timetables more room; press it again to widen it. The site remembers your choice on that device.",
          "The site works on phones. Tables turn into cards and the menus scroll sideways.",
          "After many actions a short message appears at the bottom of the screen. Some, such as dropping a class, have an Undo button there.",
        ],
      },
      {
        id: "slots",
        title: "Slots, days and holidays",
        intro:
          "The day has ten slots of 55 minutes: 8:00, 8:55, 10:20, 11:15, 12:10, 1:05, 2:00, 2:55, 3:50 and 4:45 (break from 9:50 to 10:20). Classes run Monday to Saturday; Saturday classes end at 2 PM. All times are Indian Standard Time.",
        tips: [
          "Holidays have no classes and can't be booked. They are left out of the date lists.",
          "On a day swap, a day runs another weekday's timetable (for example a Saturday that follows Monday). The home page and Free slots say so at the top.",
          "A make-up Sunday runs the classes of a holiday it makes up for. It shows like any other working day.",
          "Rooms can be requested up to four weeks ahead.",
        ],
      },
    ],
  },
  {
    id: "seeing",
    title: "Seeing the timetable",
    intro: "Anyone can use these pages, signed in or not.",
    sections: [
      {
        id: "home",
        title: "The home page",
        where: "Home",
        href: "/",
        intro: "The home page shows every room in one slot: its subject and faculty member, or that it is free, booked, or taken for a CIE or an event.",
        steps: [
          "Pick a date and a slot at the top. Press Now to come back to the current slot.",
          "Read the room cards. A card for a class that was moved or replaced shows the original class too, for example \"Moved from MEL-LAB-02\".",
          "Press a room card to see that room's whole week.",
          "The three faculty cards count who is free and busy in the department, in Cluster A and in Cluster B. Press one to see who.",
          "Under Upcoming events and booked slots, each card is an event, CIE or extra class in the next 14 days. Press the amber Classes affected button on a card to see which classes it replaced.",
          "The Free slots today card counts the room-slots still free; press Explore free slots to book one.",
        ],
        tips: ["Notices from the admins (an exam week, a room closed for repairs) show in a banner at the top of the page."],
      },
      {
        id: "search",
        title: "Finding a colleague or a class",
        where: "Home → search box",
        href: "/",
        intro: "Type initials, a name or a class in the search box on the home page, and press Find. You see where they are in every slot of the chosen day.",
        steps: ["Type for example SBM, Swaroop or 5A.", "Press Find. Each row is a person or a class, with what they are doing in every slot.", "Press Clear to go back to the rooms."],
      },
      {
        id: "room-week",
        title: "A room's week",
        where: "Home → a room card",
        intro: "One room, Monday to Saturday, slot by slot: classes, bookings, CIEs and events, and the free slots left this week.",
        steps: [
          "Use Prev, This week and Next to move between weeks.",
          "Press any cell to open that slot: what is there, who has requested it, and a Request this slot button when it is free.",
        ],
      },
      {
        id: "slot-page",
        title: "Who has requested a slot",
        where: "Free slots or a room's week → a cell",
        intro:
          "A slot's page shows what is in it now and every request for it: who asked, for what, and where each request stands. Pending requests are listed in the order the admin will look at them. Slots with pending requests show a small count in the grids.",
        tips: ["Email addresses, letters and the admin's notes stay private. Only the name, type, subject, description and status are shown."],
      },
      {
        id: "class-changes",
        title: "Class timetables and class changes",
        where: "Class timetables",
        href: "/classes",
        intro: "Each class (3A, 3B, 5A and so on) has three views: Week (its regular week), Today (today as it actually runs) and Changes (the next seven days).",
        steps: [
          "Open Class timetables from the side menu (or the top bar before you sign in), or press a class under Class timetables on the home page.",
          "Pick the class. Week shows the subject, faculty member and room in every slot, with a Subjects and faculty list below.",
          "Press Today for the day as it runs: classes on, cancelled or moved, and extra classes booked for the class.",
          "Press Changes, or All class changes on the home page, for what is altered over the next seven days: cancelled, moved, taken by another faculty member, or replaced by an event or CIE. A day with nothing changed reads Classes as usual.",
        ],
        tips: ["Print for the notice board prints the class's week on one page."],
      },
      {
        id: "availability",
        title: "Who is free: faculty availability",
        where: "Home → a faculty card",
        href: "/faculty-status",
        intro: "The Day tab lists who is free and who is busy in every slot of a day, for the department or one cluster.",
        steps: ["Pick the date, the slot and the cluster at the top.", "Read the Free and Busy lists. Busy shows what each person is doing and where.", "Faculty on leave show as busy."],
      },
    ],
  },
  {
    id: "dashboard",
    title: "Your dashboard",
    intro: "My dashboard has three tabs: Overview, Exchange requests and My requests. An amber number on a tab means something is waiting for you.",
    sections: [
      {
        id: "overview",
        title: "The Overview tab",
        where: "My dashboard → Overview",
        href: "/faculty",
        intro: "Your day at a glance: free slots today, your classes in the next seven days, classes you dropped, your regular week, and at the bottom your calendar link.",
        steps: [
          "The cards at the top count free slots today, your classes in the next seven days, and your pending requests (or exchange requests waiting on you).",
          "My upcoming classes lists every class of yours in the next seven days, with Exchange and Drop buttons. A lab or a double class over back-to-back slots is one line.",
          "Your classes come only from the timetable, plus rooms you requested yourself that were approved. Rooms an admin allots or approves for someone else are never listed as yours. If you have no classes, it says you have no classes or labs.",
          "Classes I dropped lists drops you can still undo.",
          "My week is your regular timetable from tomorrow, Monday to Saturday, with classes and other duties.",
        ],
        tips: ["The buttons at the top of the dashboard go to Find a meeting time, this manual and Request a free room."],
      },
      {
        id: "calendar",
        title: "Your classes in your own calendar",
        where: "My dashboard → Overview → Your classes in your own calendar",
        href: "/faculty",
        intro: "A private link that puts your classes, room bookings, substitute classes and make-up Sundays in Google Calendar, Outlook or your phone's calendar. It keeps itself up to date.",
        steps: [
          "Press Add to Google Calendar, or Apple or Outlook calendar, and confirm in the app that opens.",
          "Or press Copy link and paste it into any calendar app that can subscribe to a calendar by URL.",
        ],
        warning: "Anyone with the link can see your classes. If it was shared by mistake, press New link: the old one stops working and you add the new one to your calendar.",
        tips: ["Calendar apps refresh subscribed calendars on their own schedule, so a change can take a few hours to show there. The site itself is always current."],
      },
      {
        id: "exchange",
        title: "Asking a colleague to take a class",
        where: "My dashboard → Overview → My upcoming classes → Exchange",
        href: "/faculty",
        intro:
          "Can't take a class? Ask a free colleague to take it. A class, lab or tutorial over back-to-back slots is one request, and only colleagues free for every one of those slots are suggested.",
        steps: [
          "Under My upcoming classes, press Exchange next to the class.",
          "Pick a colleague. Teach (the class, for example Teach 3A) lists those who already teach the same class, so they can take their own subject; Other free faculty lists everyone else free then, lightest day first.",
          "Add a note if you like (for example where the notes are), and press Send request.",
          "Your colleague accepts or declines under Exchange requests. The line on your dashboard shows \"Asked … · waiting\", then \"… accepted · admin to approve\".",
          "Once an admin approves, the class shows as your colleague's everywhere: home page, room week, free and busy faculty, calendars and the report.",
        ],
        tips: [
          "If the admin denies it, even after your colleague agreed, nothing changes and the class stays yours.",
          "You can ask one colleague at a time. To ask someone else, withdraw the request under My requests first.",
          "A request that is still waiting when the class starts expires, and the class stays yours.",
        ],
      },
      {
        id: "exchange-inbox",
        title: "Answering a colleague's request",
        where: "My dashboard → Exchange requests",
        href: "/faculty?tab=exchange",
        intro: "When a colleague asks you to take their class, it shows under Waiting for your answer, with an amber count on the tab.",
        steps: ["Read the class, time, room and any note.", "Type a reply if you like, then press Accept or Decline.", "An accepted request still needs an admin's approval. Then it shows as your class everywhere, in your calendar too."],
        tips: ["Requests you have answered are listed under Answered, with where each one stands."],
      },
      {
        id: "drop",
        title: "Dropping a class",
        where: "My dashboard → Overview → My upcoming classes → Drop",
        href: "/faculty",
        intro: "Dropping a class cancels that one occurrence and frees the room for others. Your regular timetable stays as it is. A back-to-back class is dropped in all its slots at once.",
        steps: [
          "Type a short reason in the Reason box next to the class, and press Drop.",
          "The class moves to Classes I dropped. Colleagues free then are listed there, those who teach the course or class first, in case someone can take it.",
          "Dropped by mistake? Press Undo drop, or Undo on the message at the bottom of the screen.",
        ],
        warning: "You can undo a drop only before the class starts and only while nobody has been given the room. Dropped classes appear in the department's report.",
      },
      {
        id: "my-requests",
        title: "Following your requests",
        where: "My dashboard → My requests",
        href: "/faculty?tab=requests",
        intro: "Everything you asked for and where it stands: class exchanges first, then room requests.",
        steps: [
          "Class exchanges I asked for shows each step: Sent, the colleague's answer, then the admin's approval.",
          "Room requests shows each request with its slots, type, description and status: pending, approved, rejected, withdrawn, or expired if the slot passed before a decision. The admin's note, if any, shows under the status.",
          "While a room request is pending, press Edit to change its subject or description, or Withdraw to take it back.",
        ],
      },
    ],
  },
  {
    id: "rooms",
    title: "Rooms and meetings",
    sections: [
      {
        id: "free-slots",
        title: "Finding a free room",
        where: "Free slots",
        href: "/free",
        intro: "Every room for every slot of a day, with the free ones marked Free. Signed-in faculty see \"+ Request\" on free cells of dates that can be booked.",
        steps: [
          "Pick the date. Use Seats, Room (classroom, lab or seminar hall) and Projector to narrow the list.",
          "Press a free cell to open the slot, then press Request this slot.",
        ],
      },
      {
        id: "request-room",
        title: "Requesting a free room",
        where: "Free slots → a free cell → Request this slot",
        href: "/free",
        intro: "Ask for a free room for an extra or make-up class, or for an event. An admin approves or rejects it.",
        steps: [
          "Pick the slots. You can pick one slot or several in a row; press a slot again at either end to shorten the run.",
          "Choose Request for class or Request for event.",
          "For a class, pick the subject. Only the subjects an admin has allotted to you are offered.",
          "For an event, attach the permission letter as a PDF under 5 MB.",
          "Write a short description, for example \"Make-up class, unit 4\" or \"IEEE workshop on LLMs\".",
          "To book the same slots every week, choose Repeat weekly, for up to 4 weeks. Each week is a separate request and is approved on its own.",
          "Read any Possible clash warning (you already have a class or duty then, or the class's section is busy elsewhere), then press Send request.",
        ],
        warning: "The permission letter is mandatory for an event. An admin can reject an event request sent without one.",
        tips: [
          "If the room you wanted is taken, the page suggests similar rooms free at the same time. Other rooms free then also shows below the form.",
          "No subjects offered? Ask an admin to add your subjects. You can still request a room for an event.",
          "Requests are only for slots still to come. To record something that already happened, ask an admin.",
          "Several people can ask for the same slot. Approving one declines the others.",
        ],
      },
      {
        id: "meetings",
        title: "Finding a meeting time",
        where: "Faculty availability → Find a meeting time",
        href: "/faculty-status/meetings",
        intro: "Find the times in the next six working days when everyone you need is free.",
        steps: [
          "Under Who should attend, pick the whole department, Cluster A or Cluster B, or tick names to invite only them. Search by name or initials.",
          "Choose How long: 1 slot, or 2 or 3 slots in a row.",
          "Read the three best times (Option 1 is the best), then every other time when all of them are free. Each option says how many can attend.",
        ],
      },
    ],
  },
];

export const FAQ: ManualQuestion[] = [
  { q: "My upcoming classes is empty, or says my initials are not set.", a: "Your account isn't linked to your timetable initials yet. Ask an admin to set them under Sign-in list & names or on your Faculty profile." },
  { q: "The request form says no subjects are allotted to me.", a: "An admin gives faculty their subjects under Subjects. Ask them to add yours. Until then you can still request a room for an event." },
  { q: "I can't pick a slot on the request form.", a: "Only free slots still to come can be picked. Slots that have ended, are taken, or fall after 2 PM on a Saturday are greyed out." },
  { q: "The room I want is taken.", a: "Look at the rooms suggested on the page: they are like the one you picked and free at the same time. Free slots also lists every free room for the day." },
  { q: "Can I request a room for a date that has passed?", a: "No. Requests are only for slots still to come. An admin can record a past class or event so the records are complete." },
  { q: "My colleague accepted the exchange. Why is it still my class?", a: "An admin has to approve the exchange before the timetable changes. If the admin denies it, the class stays yours." },
  { q: "I dropped a class by mistake.", a: "Press Undo drop under Classes I dropped on your dashboard. It works until the class starts, as long as nobody has been given the room." },
  { q: "I shared my calendar link by mistake.", a: "Press New link on your dashboard. The old link stops working; add the new one to your calendar." },
  { q: "Can I change a request after sending it?", a: "Yes, while it is pending: press Edit on it under My requests to change the subject or description. To change the room or slots, withdraw it and send a new one." },
  { q: "Something on the site looks wrong.", a: "Tell the HoD or a Time Table Officer. Every change is logged with who made it and when, so they can trace it." },
];

export const GLOSSARY: ManualTerm[] = [
  { term: "Slot", meaning: "One 55-minute period. The day has ten, from 8:00 AM to 5:40 PM." },
  { term: "Initials", meaning: "How the timetable names you, for example SBM. They link your sign-in to your classes." },
  { term: "Cluster A / Cluster B", meaning: "The two groups of faculty under each HoD. Used by the free and busy faculty cards and the meeting finder." },
  { term: "CIE / SEE", meaning: "Continuous Internal Evaluation and Semester End Examination. Rooms taken for them show as CIE or SEE." },
  { term: "Booked", meaning: "A room given to someone for an approved request or an admin's allotment." },
  { term: "Other dept", meaning: "A class of another department held in one of our rooms." },
  { term: "Drop", meaning: "Cancelling one occurrence of your class, which frees its room." },
  { term: "Class exchange", meaning: "Handing one of your classes to a free colleague. They accept and an admin approves." },
  { term: "Day swap", meaning: "A day that runs another weekday's timetable, for example a Saturday that follows Monday." },
  { term: "Make-up Sunday", meaning: "A Sunday that runs a holiday's classes to make up for it." },
  { term: "Skill lab", meaning: "Lab sessions for some sections. Their classes then are released, and classes that lose their lab are moved to another room by the admin." },
  { term: "Moved from", meaning: "Shown on a class whose room was taken and that was moved to another room or time." },
];
