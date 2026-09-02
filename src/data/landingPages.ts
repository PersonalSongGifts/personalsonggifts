// Data-driven SEO landing pages. Every claim here already appears on the site
// (from $29, delivered within 24 hours, hear a preview first, 14-day guarantee).
// Nothing here mentions how the songs are produced.

export interface LandingFaq { q: string; a: string }
export interface LandingSection { heading: string; paragraphs?: string[]; bullets?: string[] }
export interface LandingPage {
  slug: string;              // URL: /custom-song/{slug}
  kind: "occasion" | "recipient" | "country";
  title: string;             // <title>, ≤60 chars
  description: string;       // meta description, ≤160 chars
  h1: string;
  intro: string[];           // 2 short paragraphs under the H1
  sections: LandingSection[];
  storyPrompts: string[];    // "What to tell us" bullets
  sampleIds: string[];       // ids from SamplePlayer's sampleSongs
  faqs: LandingFaq[];
  createParam: string;       // value for /create?occasion=
  related: string[];         // slugs to cross-link
}

const GUARANTEE = "Love it or your money back — 14-day guarantee.";
const HOW = "You tell us about them. Our team writes and produces a one-of-a-kind song from your words. You hear a preview first and pay only when you love it. From $29, delivered within 24 hours.";

export const landingPages: LandingPage[] = [
  // ───────────────────────── RECIPIENT PAGES ─────────────────────────
  {
    slug: "for-wife",
    kind: "recipient",
    title: "Custom Song for Your Wife | Personalized Song Gift From $29",
    description: "A personalized song for your wife, written from your own memories. Hear a preview first, pay only when you love it. From $29, delivered within 24 hours.",
    h1: "A Custom Song for Your Wife, Written From Your Story",
    intro: [
      "Flowers fade and jewelry sits in a drawer. A song that tells the story of how you met, the life you've built, and what she means to you is the gift she plays on repeat.",
      HOW,
    ],
    sections: [
      {
        heading: "Why a personalized song is the gift your wife will remember",
        bullets: [
          "It's about her — her name, your inside jokes, the moment you knew.",
          "It works for any occasion: anniversary, her birthday, Valentine's Day, or just because.",
          "It's ready fast. Most songs are delivered within 24 hours, so a last-minute gift still feels like months of thought.",
          "She can keep it forever and share it with friends and family from her own song page.",
        ],
      },
      {
        heading: "Songs for every chapter of your marriage",
        paragraphs: [
          "First anniversary or fortieth, the song is built from what you tell us: the road trip that went wrong and turned into your favorite memory, the way she laughs at her own jokes, the year she carried the whole family. Choose a style she loves — country, R&B, acoustic, pop, gospel, or a classic love ballad — and we'll match it.",
        ],
      },
    ],
    storyPrompts: [
      "How and where you met, and the moment you knew",
      "Her name and what you call her at home",
      "Three things she does that nobody else notices",
      "A memory only the two of you share",
      "The music she plays when she's happy",
    ],
    sampleIds: ["1", "3"],
    faqs: [
      { q: "How much does a custom song for my wife cost?", a: "Songs start at $29. Optional extras like priority delivery or the Forever Memory Package (printable lyrics, custom cover art, and a second version of the song) are available at checkout." },
      { q: "How fast will it be ready?", a: "Most songs are delivered within 24 hours. Priority delivery is available if you need it sooner." },
      { q: "Can I hear it before I pay?", a: "Yes. You'll get a preview of the song first and only pay when you love it." },
      { q: "What if she'd prefer a different style?", a: "You choose the genre and the singer's voice when you order, and you can request changes after you hear it. " + GUARANTEE },
      { q: "Can I use it for our anniversary and her birthday?", a: "Absolutely — the song is hers to keep and play anytime. Many couples order a new one for each milestone." },
    ],
    createParam: "anniversary",
    related: ["anniversary", "birthday", "valentines-day", "for-husband"],
  },
  {
    slug: "for-husband",
    kind: "recipient",
    title: "Custom Song for Your Husband | Personalized Gift From $29",
    description: "Give your husband a personalized song made from your memories together. Hear a preview first. From $29, delivered within 24 hours.",
    h1: "A Custom Song for Your Husband He'll Actually Keep",
    intro: [
      "He says he doesn't want anything. He means he doesn't want another gadget. A song about the man he is — the one who shows up, fixes things, and makes you laugh — is a gift he won't know how to shrug off.",
      HOW,
    ],
    sections: [
      {
        heading: "Why husbands love a personalized song",
        bullets: [
          "It says the things that are hard to say out loud.",
          "It fits his taste: classic rock, country, hip-hop, gospel, or an acoustic ballad.",
          "It's ready within 24 hours, so a forgotten anniversary is still saved.",
          "He can play it in the truck, at the party, or keep it just for himself.",
        ],
      },
      {
        heading: "Perfect for birthdays, anniversaries and Father's Day",
        paragraphs: [
          "Tell us about the year he became a dad, the business he built from nothing, the way he still opens your door. The more real the details, the more the song sounds like him.",
        ],
      },
    ],
    storyPrompts: [
      "What you admire most about him (be specific)",
      "A story your friends always ask him to tell",
      "How he shows love without words",
      "The song or artist he never skips",
      "What you'd say if you had one minute and no nerves",
    ],
    sampleIds: ["5", "1"],
    faqs: [
      { q: "What styles work best for a husband's song?", a: "You choose. Classic rock, country, R&B, and acoustic are popular for husbands, but any genre is available, with a male or female singer." },
      { q: "How long is the song?", a: "Songs are typically around three minutes — a full song with verses and a chorus, not a jingle." },
      { q: "Can I get it in time for his birthday tomorrow?", a: "Most songs are delivered within 24 hours, and priority delivery is available at checkout." },
      { q: "Can I hear it before paying?", a: "Yes. Preview first, pay only when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "anniversary", "birthday", "fathers-day"],
  },
  {
    slug: "for-mom",
    kind: "recipient",
    title: "Custom Song for Mom | Personalized Song She'll Cry Over",
    description: "A personalized song for your mom, written from your memories of her. Mother's Day, birthday, or just because. From $29, delivered within 24 hours.",
    h1: "A Custom Song for Mom, Made From the Things She Did for You",
    intro: [
      "She kept the house running, remembered every appointment, and never once made it about her. A song that finally puts her in the spotlight is the gift she'll play for everyone she knows.",
      HOW,
    ],
    sections: [
      {
        heading: "Why a personalized song for Mom beats flowers",
        bullets: [
          "It names the specific things she did — the packed lunches, the late-night drives, the phone calls that saved you.",
          "It's from you, in your words, in a voice and style she loves.",
          "It arrives fast, so Mother's Day or her birthday is never missed.",
          "She can share it with the whole family from her own song page.",
        ],
      },
      {
        heading: "For Mother's Day, her birthday, or a milestone",
        paragraphs: [
          "Turning 60, 70, or 80? Retiring? Becoming a grandmother? Every one of those deserves a song that tells her story back to her. Siblings often order together and each add their own memory.",
        ],
      },
    ],
    storyPrompts: [
      "Something she did for you that you never properly thanked her for",
      "Her sayings — the phrases the whole family quotes",
      "What she's like when she's laughing",
      "A hard year she carried you through",
      "The music she sang in the kitchen",
    ],
    sampleIds: ["4", "2"],
    faqs: [
      { q: "Is this a good Mother's Day gift?", a: "It's one of our most popular. Order a few days early if you can, but most songs are delivered within 24 hours." },
      { q: "Can my brothers and sisters add their memories too?", a: "Yes — gather everyone's stories and put them all in the form. We'll weave them into one song." },
      { q: "What if she doesn't like the style?", a: "You choose the genre and the singer, you hear a preview first, and you can ask for changes. " + GUARANTEE },
      { q: "How much does it cost?", a: "From $29. A printable lyric keepsake and custom cover art are available as an add-on." },
    ],
    createParam: "mothers-day",
    related: ["mothers-day", "birthday", "for-dad", "thank-you"],
  },
  {
    slug: "for-dad",
    kind: "recipient",
    title: "Custom Song for Dad | Personalized Father's Day & Birthday Gift",
    description: "A personalized song for your dad, built from the stories only your family knows. Father's Day, birthday, retirement. From $29, delivered within 24 hours.",
    h1: "A Custom Song for Dad He'll Pretend Not to Cry At",
    intro: [
      "Dads are hard to buy for because they never ask for anything. A song that tells the story of the man who taught you to ride a bike, drive stick, and stand up straight is a gift no store sells.",
      HOW,
    ],
    sections: [
      {
        heading: "Why a personalized song is the Father's Day gift that lands",
        bullets: [
          "It's in his style — classic rock, country, blues, gospel, or whatever he blasts in the garage.",
          "It names the real moments: the games he never missed, the advice that stuck, the jokes that didn't.",
          "It's ready within 24 hours, so a last-minute Father's Day still feels planned.",
          "Grandkids love adding their part.",
        ],
      },
      {
        heading: "Birthdays, retirement, and the milestones in between",
        paragraphs: [
          "A 60th birthday, a retirement party, or the day he walks you down the aisle — each one is a chance to tell him what he means to you in a way he'll keep.",
        ],
      },
    ],
    storyPrompts: [
      "The lesson he taught you that you still use",
      "His catchphrase or the joke he tells every Thanksgiving",
      "A time he showed up when it counted",
      "What he's proud of (and what he'd never admit he's proud of)",
      "His favorite band or genre",
    ],
    sampleIds: ["5", "1"],
    faqs: [
      { q: "What if Dad isn't sentimental?", a: "Tell us that. Songs can be funny, upbeat, and full of inside jokes — it doesn't have to be a ballad." },
      { q: "Can the whole family contribute?", a: "Yes. Collect memories from siblings and grandkids and put them in the form together." },
      { q: "How quickly will it arrive?", a: "Most songs are delivered within 24 hours. Priority delivery is available." },
      { q: "Can I hear it before I pay?", a: "Yes. You'll hear a preview first and only pay when you love it. " + GUARANTEE },
    ],
    createParam: "fathers-day",
    related: ["fathers-day", "birthday", "for-mom", "retirement"],
  },

  // ───────────────────────── OCCASION PAGES ─────────────────────────
  {
    slug: "anniversary",
    kind: "occasion",
    title: "Custom Anniversary Song | Personalized Song for Your Spouse",
    description: "Turn your love story into a personalized anniversary song. Hear a preview first, pay only when you love it. From $29, delivered within 24 hours.",
    h1: "A Custom Anniversary Song Made From Your Love Story",
    intro: [
      "Every anniversary gift says \"I remembered.\" A custom song says \"I remember everything\" — the first date, the tiny apartment, the night you almost gave up and didn't.",
      HOW,
    ],
    sections: [
      {
        heading: "The anniversary gift for people who have everything",
        bullets: [
          "Works for your first anniversary or your fiftieth.",
          "Your names, your places, your memories — nothing generic.",
          "Choose the genre and the voice: country, R&B, acoustic, pop, or a classic love ballad.",
          "Play it at dinner, at the party, or just the two of you in the kitchen.",
        ],
      },
      {
        heading: "Anniversary songs by year",
        paragraphs: [
          "First anniversary songs tend to be about the wedding and the year of firsts. Tenth and twentieth anniversary songs are about the family you built and the hard years you got through together. Twenty-fifth, thirtieth, and fiftieth anniversary songs are often ordered by the kids and grandkids as a surprise. Tell us the year and the story; the song does the rest.",
        ],
      },
    ],
    storyPrompts: [
      "How you met and the moment it became real",
      "Your wedding day (or the elopement, or the courthouse)",
      "A hard season you got through together",
      "The small daily things that still make you smile",
      "Your song, your place, your inside joke",
    ],
    sampleIds: ["1", "3"],
    faqs: [
      { q: "How much does a custom anniversary song cost?", a: "From $29, with optional extras such as priority delivery and a printable lyric keepsake with custom cover art." },
      { q: "Our anniversary is tomorrow. Is that too late?", a: "Most songs are delivered within 24 hours, and priority delivery is available at checkout." },
      { q: "Can I hear the song before I pay?", a: "Yes — you get a preview first and pay only when you love it. " + GUARANTEE },
      { q: "Can we play it at our anniversary party?", a: "Yes. The song is yours to play and share with family and friends." },
      { q: "Can the kids order one for our parents' 50th?", a: "Yes, and it's one of the most popular reasons people order. Gather everyone's memories and include them in the form." },
    ],
    createParam: "anniversary",
    related: ["for-wife", "for-husband", "wedding", "valentines-day"],
  },
  {
    slug: "birthday",
    kind: "occasion",
    title: "Custom Birthday Song | Personalized Song With Their Name & Story",
    description: "Not a name-in-a-jingle — a full personalized birthday song about who they are. Hear a preview first. From $29, delivered within 24 hours.",
    h1: "A Custom Birthday Song About Them, Not Just Their Name",
    intro: [
      "Anyone can find a birthday song with a name in it. This is a full song about the person — their laugh, their stubborn streak, the year they had, and why everyone in the room is glad they were born.",
      HOW,
    ],
    sections: [
      {
        heading: "A birthday gift that doesn't get returned",
        bullets: [
          "For wives, husbands, moms, dads, kids, best friends, and grandparents.",
          "Milestone birthdays — 18th, 21st, 30th, 40th, 50th, 60th, 70th, 80th — are a favorite.",
          "Any style: upbeat pop for a party, acoustic for a quiet moment, hip-hop for the friend who'd want it.",
          "Ready within 24 hours, so a forgotten birthday is still saved.",
        ],
      },
      {
        heading: "How people use their birthday song",
        paragraphs: [
          "Play it at the party as the cake comes out. Send the link the morning of. Put the printable lyrics in a frame. Some families make it a tradition and order one every year with a new chapter.",
        ],
      },
    ],
    storyPrompts: [
      "What they're known for among friends and family",
      "The best thing that happened to them this year",
      "A funny story that always gets told about them",
      "What you'd want them to hear on their birthday",
      "The music they'd choose for their own party",
    ],
    sampleIds: ["4", "5"],
    faqs: [
      { q: "Is this just a happy birthday song with a name?", a: "No. It's a full custom song — verses and a chorus — written from the stories you share about the person." },
      { q: "Can I get it by tomorrow?", a: "Most songs are delivered within 24 hours. Priority delivery is available if you're cutting it close." },
      { q: "What does it cost?", a: "From $29. Extras like a printable lyric keepsake and custom cover art are optional." },
      { q: "Can I hear it before I pay?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "for-husband", "for-mom", "for-dad"],
  },
  {
    slug: "thank-you",
    kind: "occasion",
    title: "Custom Thank You Song | Personalized Appreciation Gift",
    description: "Say thank you with a personalized song for a teacher, nurse, mentor, friend, or parent. From $29, delivered within 24 hours.",
    h1: "A Custom Thank You Song for the Person Who Showed Up",
    intro: [
      "Some people change your life and never get properly thanked — the teacher who believed in you, the nurse who stayed, the friend who drove through the night. A thank-you song says it in a way a card can't.",
      HOW,
    ],
    sections: [
      {
        heading: "Who people thank with a song",
        bullets: [
          "Teachers, coaches, and mentors at the end of the year",
          "Nurses, caregivers, and doctors after a hard season",
          "Parents and grandparents who did everything",
          "Best friends, neighbors, and pastors",
          "Bosses and coworkers who went above and beyond",
        ],
      },
      {
        heading: "How an appreciation song is written",
        paragraphs: [
          "You tell us what they did and what it meant. The song puts the specifics into verses — the exact thing they said, the day they showed up — and a chorus that says thank you the way you've been meaning to.",
        ],
      },
    ],
    storyPrompts: [
      "Exactly what they did for you, and when",
      "What would have happened without them",
      "A detail that shows who they are",
      "What you'd say if you weren't afraid of getting emotional",
      "The kind of music they'd appreciate",
    ],
    sampleIds: ["4", "1"],
    faqs: [
      { q: "Is a thank-you song appropriate for a teacher or coworker?", a: "Yes — tell us the tone you want. It can be warm and heartfelt or light and funny." },
      { q: "Can a group of us order one together?", a: "Yes. Collect everyone's memories and messages and include them in the form." },
      { q: "How fast is delivery?", a: "Most songs are delivered within 24 hours." },
      { q: "Can I hear it first?", a: "Yes. You'll hear a preview before paying. " + GUARANTEE },
    ],
    createParam: "thank-you",
    related: ["for-mom", "for-dad", "birthday", "friendship"],
  },
  {
    slug: "memorial",
    kind: "occasion",
    title: "Memorial Song for a Loved One | Personalized Tribute Song",
    description: "A personalized memorial song that tells their story — for a funeral, celebration of life, or the anniversary of a loss. Delivered within 24 hours.",
    h1: "A Memorial Song That Tells Their Story",
    intro: [
      "When someone is gone, the stories are what's left. A memorial song gathers them — the way they laughed, what they taught you, the phrase they always said — into something you can play at the service and keep for the years after.",
      "You tell us about them. Our team writes and produces a gentle, one-of-a-kind song from your words. You hear it first and pay only when it feels right. Songs are ready within 24 hours, because we know these days come fast.",
    ],
    sections: [
      {
        heading: "Where families play their memorial song",
        bullets: [
          "At the funeral or celebration of life, during the slideshow",
          "On the first anniversary of the loss",
          "Shared with family who couldn't be there",
          "For a pet who was part of the family",
        ],
      },
      {
        heading: "Written with care",
        paragraphs: [
          "Tell us whatever you're able to. Some families write pages; some write three sentences. Choose a style — a hymn, a soft acoustic song, a country ballad, gospel — and the voice you'd want to hear. If anything in the preview doesn't feel right, tell us and we'll change it.",
        ],
      },
    ],
    storyPrompts: [
      "Their name and who they were to you",
      "A story that captures them",
      "What they said that you still hear",
      "What they loved — music, places, people",
      "What you want the people at the service to feel",
    ],
    sampleIds: ["2", "4"],
    faqs: [
      { q: "How quickly can a memorial song be ready?", a: "Most songs are delivered within 24 hours, and priority delivery is available if the service is soon." },
      { q: "Can it be a hymn or gospel style?", a: "Yes. Choose the style and voice when you order — hymn, gospel, acoustic, country, or a soft ballad are common choices." },
      { q: "Can we play it at the funeral?", a: "Yes. The song is yours to play and share with everyone who loved them." },
      { q: "What if we need to change something?", a: "You hear a preview first and can request changes before you pay. " + GUARANTEE },
    ],
    createParam: "memorial",
    related: ["thank-you", "for-mom", "for-dad", "anniversary"],
  },
  {
    slug: "valentines-day",
    kind: "occasion",
    title: "Custom Valentine's Day Song | Personalized Love Song Gift",
    description: "A personalized Valentine's Day song written from your love story. Hear a preview first, pay when you love it. From $29, delivered within 24 hours.",
    h1: "A Custom Valentine's Day Song Written From Your Love Story",
    intro: [
      "Chocolate is gone by the 15th. A love song about the two of you — how you met, what you survived, why you're still choosing each other — gets played for years.",
      HOW,
    ],
    sections: [
      {
        heading: "Why a personalized love song wins Valentine's Day",
        bullets: [
          "It's about your story, not a generic love song.",
          "Any style she or he loves — R&B, country, pop, acoustic, or a slow ballad.",
          "Ready within 24 hours, so February 13th is not too late.",
          "Perfect for wives, husbands, girlfriends, boyfriends, and partners.",
        ],
      },
      {
        heading: "Valentine's ideas that pair with a song",
        paragraphs: [
          "Play it at dinner. Send the link with the morning coffee. Add the printable lyric keepsake and custom cover art and frame it. Some people plan a proposal around it — the song tells the story right up to the question.",
        ],
      },
    ],
    storyPrompts: [
      "The moment you fell for them",
      "What you love that they don't know you notice",
      "A memory you'd relive if you could",
      "Where you want the two of you to be in ten years",
      "The song that's already 'yours'",
    ],
    sampleIds: ["3", "1"],
    faqs: [
      { q: "When should I order for Valentine's Day?", a: "Most songs are delivered within 24 hours, but ordering a few days early gives you time to hear it and request changes." },
      { q: "Can it lead into a proposal?", a: "Yes — many people do exactly that. Tell us and we'll build the song toward the question." },
      { q: "How much is it?", a: "From $29. Priority delivery and the printable keepsake with custom cover art are optional extras." },
      { q: "Can I hear it before paying?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "valentines",
    related: ["for-wife", "for-husband", "anniversary", "proposal"],
  },
  {
    slug: "wedding",
    kind: "occasion",
    title: "Custom Wedding Song | Personalized First Dance & Wedding Gift",
    description: "A personalized wedding song for your first dance, vows, or as a gift for the couple. Hear a preview first. From $29, delivered within 24 hours.",
    h1: "A Custom Wedding Song for Your First Dance or the Couple You Love",
    intro: [
      "The first dance is the one moment everyone watches. A song written about the two of you — the names, the story, the promise — makes it the moment nobody forgets.",
      HOW,
    ],
    sections: [
      {
        heading: "Ways to use a personalized wedding song",
        bullets: [
          "First dance or the walk down the aisle",
          "A surprise from the parents, the maid of honor, or the best man",
          "A gift for the couple's anniversary of the wedding",
          "A song for the reception slideshow",
        ],
      },
      {
        heading: "Choose the sound of your day",
        paragraphs: [
          "A slow acoustic ballad for the first dance, a country song for the reception, gospel for the ceremony, or something upbeat for the exit. You choose the genre and the singer's voice, hear a preview, and adjust anything before the big day.",
        ],
      },
    ],
    storyPrompts: [
      "How the couple met and the proposal",
      "What each of them loves about the other",
      "The moment friends knew it was serious",
      "The vibe of the wedding — venue, style, season",
      "Lines from the vows you want echoed",
    ],
    sampleIds: ["1", "3"],
    faqs: [
      { q: "Can we use it for our first dance?", a: "Yes. Tell us it's for the first dance and choose a slower style; you'll hear a preview well before the day." },
      { q: "Can I order it as a gift for a couple getting married?", a: "Yes — parents, siblings, and wedding parties do this often. Include the stories you know." },
      { q: "How far ahead should we order?", a: "Most songs are delivered within 24 hours, but ordering a week or two early gives you time for any changes." },
      { q: "Is there a preview?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "wedding",
    related: ["anniversary", "proposal", "for-wife", "for-husband"],
  },
  {
    slug: "proposal",
    kind: "occasion",
    title: "Custom Proposal Song | A Personalized Song to Pop the Question",
    description: "A personalized proposal song that tells your story and ends with the question. Hear a preview first. From $29, delivered within 24 hours.",
    h1: "A Custom Proposal Song That Ends With the Question",
    intro: [
      "You've planned the place and the ring. The song is what makes the moment yours: your names, your story, the reasons — building to the words you've been rehearsing.",
      HOW,
    ],
    sections: [
      {
        heading: "How proposal songs are built",
        bullets: [
          "Verses tell your story from the first meeting to now.",
          "The chorus says why it's them.",
          "The final lines lead into the question — or leave it for you to ask.",
          "Choose a style they love and the voice you want.",
        ],
      },
      {
        heading: "Ideas for the moment",
        paragraphs: [
          "Play it on a speaker at the spot where you met. Put it on in the car on the way somewhere. Send the link and be there when they press play. Add the printable lyrics and custom cover art so they can keep the song and the story together.",
        ],
      },
    ],
    storyPrompts: [
      "How you met and when you knew",
      "What they say about you when you're not around",
      "The place that matters to both of you",
      "How you want to ask — and whether the song should ask for you",
      "The music they'd want in the background of a movie about their life",
    ],
    sampleIds: ["3", "1"],
    faqs: [
      { q: "Will the song actually include the proposal?", a: "If you want it to. Tell us how you want to ask and whether the song should say the words or lead up to them." },
      { q: "Can I keep it a secret?", a: "Yes. The preview and delivery come to you only, until you decide to share it." },
      { q: "How fast will it be ready?", a: "Most songs are delivered within 24 hours. Priority delivery is available." },
      { q: "Can I hear it before I pay?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "proposal",
    related: ["wedding", "valentines-day", "anniversary", "for-wife"],
  },
  {
    slug: "mothers-day",
    kind: "occasion",
    title: "Custom Mother's Day Song | Personalized Song for Mom",
    description: "The Mother's Day gift she'll play for everyone: a personalized song written from your memories of her. From $29, delivered within 24 hours.",
    h1: "A Custom Mother's Day Song She'll Play for Everyone",
    intro: [
      "Every Mother's Day she gets flowers. This year she gets a song about the lunches she packed, the fevers she sat up with, and the way she still asks if you've eaten.",
      HOW,
    ],
    sections: [
      {
        heading: "Why moms love a personalized song",
        bullets: [
          "It names what she actually did, year after year.",
          "It's in a style she loves — gospel, country, a soft ballad, or something upbeat.",
          "Siblings can each add a memory.",
          "It's ready within 24 hours, so a late start still lands on the day.",
        ],
      },
      {
        heading: "For moms, stepmoms, grandmothers, and the women who raised you",
        paragraphs: [
          "Mother's Day songs are also ordered for grandmothers, aunts, mothers-in-law, and the neighbor who was a second mom. Tell us who she is to you and the song will say it.",
        ],
      },
    ],
    storyPrompts: [
      "One specific thing she did that you never thanked her for",
      "The phrase she always says",
      "What she's like when the whole family is together",
      "A hard time she carried you through",
      "Her favorite music",
    ],
    sampleIds: ["4", "2"],
    faqs: [
      { q: "When should I order for Mother's Day?", a: "A few days early is ideal, but most songs are delivered within 24 hours." },
      { q: "Can my siblings and I order one together?", a: "Yes. Put everyone's memories in the form and we'll weave them into one song." },
      { q: "Can I add printed lyrics?", a: "Yes — the Forever Memory Package adds a printable lyric keepsake, custom cover art from a photo, and a second version of the song." },
      { q: "Can I hear it first?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "mothers-day",
    related: ["for-mom", "birthday", "thank-you", "fathers-day"],
  },
  {
    slug: "fathers-day",
    kind: "occasion",
    title: "Custom Father's Day Song | Personalized Song for Dad",
    description: "A personalized Father's Day song about the man who showed up. Any style he loves. From $29, delivered within 24 hours.",
    h1: "A Custom Father's Day Song About the Man Who Showed Up",
    intro: [
      "He didn't want a tie last year and he won't want one this year. A song about the games he never missed and the lessons that stuck is the Father's Day gift he'll play in the truck.",
      HOW,
    ],
    sections: [
      {
        heading: "Why a personalized song works for dads",
        bullets: [
          "It's in his style — classic rock, country, blues, gospel, or hip-hop.",
          "It can be funny, proud, sentimental, or all three.",
          "Grandkids can add their part.",
          "Ready within 24 hours.",
        ],
      },
      {
        heading: "For dads, stepdads, grandfathers, and father figures",
        paragraphs: [
          "Tell us who he is to you. The coach, the uncle who stepped in, the grandfather who taught you to fish — every one of them has a story worth a song.",
        ],
      },
    ],
    storyPrompts: [
      "The advice he gave that you still use",
      "A time he showed up when it mattered",
      "His running joke or catchphrase",
      "What he's secretly proud of",
      "The music he blasts in the garage",
    ],
    sampleIds: ["5", "1"],
    faqs: [
      { q: "Can the song be funny instead of emotional?", a: "Yes — tell us the tone. Plenty of Father's Day songs are built on inside jokes." },
      { q: "How fast can it be ready?", a: "Most songs are delivered within 24 hours, and priority delivery is available." },
      { q: "What does it cost?", a: "From $29, with optional extras at checkout." },
      { q: "Is there a preview?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "fathers-day",
    related: ["for-dad", "birthday", "mothers-day", "retirement"],
  },

  // ───────────────────────── COUNTRY PAGES ─────────────────────────
  {
    slug: "south-africa",
    kind: "country",
    title: "Personalised Song Gift in South Africa | From $29, 24-Hour Delivery",
    description: "A personalised song for your wife, husband, mom or friend in South Africa — written from your story, delivered online within 24 hours. From $29 USD.",
    h1: "A Personalised Song Gift for Someone in South Africa",
    intro: [
      "Thousands of South Africans have ordered a personalised song for a wife, husband, mother, or friend — for a birthday, an anniversary, a memorial, or just to say thank you. It's delivered online, so there's no shipping, no customs, and no waiting weeks.",
      HOW,
    ],
    sections: [
      {
        heading: "How it works from South Africa",
        bullets: [
          "Order from your phone in a few minutes; pay by card or PayPal in US dollars ($29 — your bank converts to rand).",
          "Delivered online within 24 hours to your email and a private song page — no courier, no import fees.",
          "Choose any style: gospel, R&B, Afro-pop-inspired ballads, country, or acoustic, with a male or female voice.",
          "Include Zulu, Xhosa, Afrikaans, or Sotho words and phrases in the story you tell us — names, pet names, and sayings make the song feel like home.",
        ],
      },
      {
        heading: "Popular occasions in South Africa",
        paragraphs: [
          "Birthdays and anniversaries lead the way, followed by thank-you songs for mothers and memorial songs for a loved one who has passed. Many orders come from family members living abroad who want to send something that arrives instantly and means more than money.",
        ],
      },
    ],
    storyPrompts: [
      "Who the song is for and what you call them",
      "A memory only your family knows",
      "Any words in isiZulu, isiXhosa, Afrikaans, or Sesotho you want included",
      "The style they love — gospel, R&B, country, acoustic",
      "The occasion and the date",
    ],
    sampleIds: ["4", "1"],
    faqs: [
      { q: "Can I pay in rand?", a: "Prices are in US dollars ($29 to start) and charged by card or PayPal; your bank converts to rand at its rate." },
      { q: "How is the song delivered?", a: "Online, within 24 hours — by email and on a private song page you can share on WhatsApp. Nothing is shipped." },
      { q: "Can the song include words in my language?", a: "Yes. Add the names, phrases, or sayings you want in the story you give us, and we'll work them in." },
      { q: "Can I hear it before I pay?", a: "Yes. You'll hear a preview first and pay only when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "birthday", "anniversary", "memorial"],
  },
  {
    slug: "nigeria",
    kind: "country",
    title: "Personalised Song Gift in Nigeria | From $29, Delivered Online",
    description: "Send a personalised song to your wife, husband, mum or friend in Nigeria — written from your story, delivered online within 24 hours. From $29 USD.",
    h1: "A Personalised Song Gift for Someone in Nigeria",
    intro: [
      "From Lagos to Abuja and the family abroad, Nigerians order personalised songs for birthdays, anniversaries, and to celebrate the people who carried them. The song is delivered online within 24 hours — no shipping, no waiting.",
      HOW,
    ],
    sections: [
      {
        heading: "How it works from Nigeria",
        bullets: [
          "Order from your phone; pay by card or PayPal in US dollars ($29 to start).",
          "Delivered online within 24 hours — email plus a private song page you can share on WhatsApp.",
          "Choose the style: Afrobeats-inspired, gospel, R&B, highlife-flavoured ballads, or acoustic, with a male or female voice.",
          "Include Yoruba, Igbo, Hausa, or Pidgin words, names, and sayings in your story so the song sounds like family.",
        ],
      },
      {
        heading: "Popular occasions in Nigeria",
        paragraphs: [
          "Birthdays for wives and husbands are the most common, followed by songs for mothers, thank-you songs for mentors and pastors, and memorial tributes. Many orders come from Nigerians living overseas who want a gift that lands the same day.",
        ],
      },
    ],
    storyPrompts: [
      "Who it's for and their pet name at home",
      "A story that shows who they are",
      "Any Yoruba, Igbo, Hausa, or Pidgin phrases to include",
      "The style — Afrobeats-inspired, gospel, R&B, acoustic",
      "The occasion and date",
    ],
    sampleIds: ["4", "5"],
    faqs: [
      { q: "Can I pay in naira?", a: "Prices are in US dollars ($29 to start), paid by card or PayPal. Your bank converts at its rate." },
      { q: "How is it delivered?", a: "Online within 24 hours — by email and on a private song page. Nothing is shipped, so there are no customs or courier fees." },
      { q: "Can the lyrics include my language?", a: "Yes. Put the names, phrases, and sayings you want in the story you share and we'll work them in." },
      { q: "Can I hear it before I pay?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "for-husband", "birthday", "thank-you"],
  },
  {
    slug: "kenya",
    kind: "country",
    title: "Personalised Song Gift in Kenya | From $29, Delivered Online",
    description: "A personalised song for someone in Kenya — written from your story, delivered online within 24 hours. Birthdays, anniversaries, memorials. From $29 USD.",
    h1: "A Personalised Song Gift for Someone in Kenya",
    intro: [
      "Whether you're in Nairobi or sending love from abroad, a personalised song is a gift that arrives in hours and lasts for years — for a birthday, an anniversary, a thank-you to your mum, or a tribute to someone you've lost.",
      HOW,
    ],
    sections: [
      {
        heading: "How it works from Kenya",
        bullets: [
          "Order from your phone; pay by card or PayPal in US dollars ($29 to start).",
          "Delivered online within 24 hours — email plus a private song page to share on WhatsApp.",
          "Choose gospel, R&B, benga- or rumba-flavoured ballads, country, or acoustic, with a male or female voice.",
          "Include Swahili or Sheng words, names, and sayings in your story.",
        ],
      },
      {
        heading: "Popular occasions in Kenya",
        paragraphs: [
          "Birthday songs for wives and husbands, thank-you songs for parents, and memorial songs played at a celebration of life are the most common orders.",
        ],
      },
    ],
    storyPrompts: [
      "Who it's for and what you call them",
      "A memory that shows who they are",
      "Any Swahili or Sheng phrases to include",
      "The style they love",
      "The occasion and date",
    ],
    sampleIds: ["4", "1"],
    faqs: [
      { q: "Can I pay in Kenyan shillings?", a: "Prices are in US dollars ($29 to start), paid by card or PayPal; your bank converts at its rate." },
      { q: "How is the song delivered?", a: "Online within 24 hours — email and a private song page. Nothing is shipped." },
      { q: "Can the song include Swahili?", a: "Yes. Add the words and phrases you want in the story you give us." },
      { q: "Can I hear it before I pay?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "birthday", "thank-you", "memorial"],
  },
  {
    slug: "philippines",
    kind: "country",
    title: "Personalized Song Gift Philippines | From $29, Delivered Online",
    description: "A personalized song for someone in the Philippines — written from your story, delivered online within 24 hours. Birthdays, anniversaries, thank-you. From $29 USD.",
    h1: "A Personalized Song Gift for Someone in the Philippines",
    intro: [
      "OFWs and families across the Philippines order personalized songs for a birthday, an anniversary, a mother's sacrifice, or a friend who never left their side. The song is delivered online within 24 hours — perfect when you're far away and want to be there.",
      HOW,
    ],
    sections: [
      {
        heading: "How it works from the Philippines",
        bullets: [
          "Order from your phone; pay by card or PayPal in US dollars ($29 to start).",
          "Delivered online within 24 hours — email plus a private song page to share on Messenger or Viber.",
          "Choose OPM-style ballads, acoustic, pop, R&B, or gospel, with a male or female voice.",
          "Include Tagalog, Bisaya, or Ilocano words, names, and sayings in your story.",
        ],
      },
      {
        heading: "Popular occasions in the Philippines",
        paragraphs: [
          "Birthday songs for wives, husbands, and moms lead the way, followed by anniversary songs and thank-you songs for parents and ninongs and ninangs. Many orders come from Filipinos working abroad.",
        ],
      },
    ],
    storyPrompts: [
      "Who it's for and their nickname",
      "A story that shows who they are",
      "Any Tagalog, Bisaya, or Ilocano phrases to include",
      "The style — OPM ballad, acoustic, pop, gospel",
      "The occasion and date",
    ],
    sampleIds: ["4", "3"],
    faqs: [
      { q: "Can I pay in pesos?", a: "Prices are in US dollars ($29 to start), paid by card or PayPal; your bank converts at its rate." },
      { q: "How is the song delivered?", a: "Online within 24 hours — email and a private song page. Nothing is shipped." },
      { q: "Can the song include Tagalog?", a: "Yes. Add the words and phrases you want in the story you share with us." },
      { q: "Can I hear it before I pay?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "for-mom", "birthday", "anniversary"],
  },
  {
    slug: "jamaica",
    kind: "country",
    title: "Personalised Song Gift in Jamaica | From $29, Delivered Online",
    description: "A personalised song for someone in Jamaica — written from your story, delivered online within 24 hours. Birthdays, anniversaries, memorials. From $29 USD.",
    h1: "A Personalised Song Gift for Someone in Jamaica",
    intro: [
      "For a birthday in Kingston, an anniversary in Montego Bay, or a tribute sent from family in London or New York, a personalised song arrives in hours and gets played for years.",
      HOW,
    ],
    sections: [
      {
        heading: "How it works from Jamaica",
        bullets: [
          "Order from your phone; pay by card or PayPal in US dollars ($29 to start).",
          "Delivered online within 24 hours — email plus a private song page to share on WhatsApp.",
          "Choose reggae- or dancehall-inspired, gospel, R&B, country, or acoustic, with a male or female voice.",
          "Include Patois phrases, names, and sayings in your story.",
        ],
      },
      {
        heading: "Popular occasions in Jamaica",
        paragraphs: [
          "Birthday songs for wives and husbands, thank-you songs for mothers and grandmothers, and memorial songs for a nine-night or celebration of life are the most common orders.",
        ],
      },
    ],
    storyPrompts: [
      "Who it's for and what you call them",
      "A memory that captures them",
      "Any Patois phrases to include",
      "The style they love",
      "The occasion and date",
    ],
    sampleIds: ["4", "1"],
    faqs: [
      { q: "Can I pay in Jamaican dollars?", a: "Prices are in US dollars ($29 to start), paid by card or PayPal; your bank converts at its rate." },
      { q: "How is it delivered?", a: "Online within 24 hours — email and a private song page. Nothing is shipped." },
      { q: "Can it include Patois?", a: "Yes. Add the words and phrases you want in the story you give us." },
      { q: "Can I hear it before I pay?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "birthday", "memorial", "thank-you"],
  },
  {
    slug: "ghana",
    kind: "country",
    title: "Personalised Song Gift in Ghana | From $29, Delivered Online",
    description: "A personalised song for someone in Ghana — written from your story, delivered online within 24 hours. Birthdays, anniversaries, thank-you. From $29 USD.",
    h1: "A Personalised Song Gift for Someone in Ghana",
    intro: [
      "From Accra and Kumasi to the family abroad, a personalised song is the gift that arrives the same day and says everything — for a birthday, an anniversary, a mother's sacrifice, or a friend who has always been there.",
      HOW,
    ],
    sections: [
      {
        heading: "How it works from Ghana",
        bullets: [
          "Order from your phone; pay by card or PayPal in US dollars ($29 to start).",
          "Delivered online within 24 hours — email plus a private song page to share on WhatsApp.",
          "Choose highlife- or Afrobeats-inspired, gospel, R&B, or acoustic, with a male or female voice.",
          "Include Twi, Ga, Ewe, or Pidgin words, names, and sayings in your story.",
        ],
      },
      {
        heading: "Popular occasions in Ghana",
        paragraphs: [
          "Birthday and anniversary songs for spouses, thank-you songs for mothers and pastors, and memorial tributes are the most common orders.",
        ],
      },
    ],
    storyPrompts: [
      "Who it's for and what you call them",
      "A story that shows who they are",
      "Any Twi, Ga, Ewe, or Pidgin phrases to include",
      "The style they love",
      "The occasion and date",
    ],
    sampleIds: ["4", "5"],
    faqs: [
      { q: "Can I pay in cedis?", a: "Prices are in US dollars ($29 to start), paid by card or PayPal; your bank converts at its rate." },
      { q: "How is the song delivered?", a: "Online within 24 hours — email and a private song page. Nothing is shipped." },
      { q: "Can the song include Twi?", a: "Yes. Add the words and phrases you want in the story you share." },
      { q: "Can I hear it before I pay?", a: "Yes. Preview first, pay when you love it. " + GUARANTEE },
    ],
    createParam: "birthday",
    related: ["for-wife", "birthday", "thank-you", "anniversary"],
  },
];

export const landingPageBySlug = (slug: string) => landingPages.find((p) => p.slug === slug);
