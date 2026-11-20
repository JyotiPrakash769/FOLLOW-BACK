/**
 * Interface text in English, Hindi and Odia. Instagram's own menu names
 * (Settings, Accounts Center, ...) stay in English in every language, because
 * that is what most people see in the app. Missing keys fall back to English.
 *
 * The choice is kept in the address (?lang=hi), not in browser storage, so a
 * refresh keeps the language while the page still saves nothing.
 */

/** @type {Record<string, string>} */
const en = {
  deltaAgo: "Newest export: {n} days old",
  deltaToday: "Newest export: today",
  deltaSince: "+{g} followers, -{l} unfollowed since {d}",
  deltaStale: "time for a fresh ZIP",
  title: "FOLLOW/BACK - Instagram follow-back checker",
  sub: "Instagram follow-back checker. Runs in your browser. Nothing is uploaded.",
  priv: "No analytics, no CDN, no network requests, and nothing saved in your browser: refresh and it starts over. Open DevTools, Network tab, and reload: the page talks to nobody.",
  lang: "Language",
  theme: "Light / Dark",
  snapshots: "Snapshots",
  insights: "Insights",
  drop: "Drop Instagram ZIP here",
  dropSmall: "or tap to pick it. Drop two ZIPs, an older one and a newer one, to see who unfollowed you in between.",
  howTitle: "How to get your file",
  how1: "Open Instagram, go to Settings, then Accounts Center.",
  how2: "Tap Your information and permissions, then Download your information.",
  how3: "Choose Followers and following only. Set format to JSON and date range to All time.",
  how4: "Request the download. Instagram emails you when it is ready, from a few minutes to a few hours.",
  how5: "Download the ZIP and drop it in the box above. Do not unzip it.",
  howHint:
    "Want to see who unfollowed you? Keep last month's ZIP and drop it together with a fresh one. Each export becomes a snapshot, which unlocks the Unfollowed you tab, the timeline and the history chart.",
  bigl: "Do not follow you back",
  followers: "Followers",
  following: "Following",
  mutual: "Mutual",
  claimPh: "FOLLOWERS SHOWN ON YOUR PROFILE",
  check: "Check",
  searchPh: "SEARCH USERNAME",
  sortAz: "A-Z",
  sortNew: "Newest",
  sortOld: "Oldest",
  all: "All",
  alwaysSkip: "Always skip",
  snooze: "Snooze",
  done: "Done",
  copy: "Copy",
  csv: "CSV",
  image: "Summary image",
  queue: "Queue mode",
  open10: "Open next 10",
  more: "Show more",
  history: "History",
  snapsHint: "Label a snapshot so you remember what it was, or delete one that was uploaded with the wrong date range.",
  backup: "Backup",
  backupHint:
    "Nothing is saved: refreshing or closing this page clears it. To compare with a later export, download a backup now and restore it next time, or simply keep the ZIP.",
  pwPh: "BACKUP PASSWORD (RECOMMENDED)",
  bkdl: "Download backup",
  bkf: "Restore from file",
  clr: "Clear",
  paste: "Paste a backup instead",
  rs: "Restore from text",

  tab_notback: "Not back",
  tab_fans: "You skip",
  tab_mutual: "Mutual",
  tab_lost: "Unfollowed you",
  tab_gained: "New followers",
  tab_boomerang: "Boomerang",
  tab_timeline: "Timeline",
  tab_pending: "Pending out",
  tab_received: "Requests in",
  tab_unfollowed: "You unfollowed",
  tab_blocked: "Blocked",
  tab_restricted: "Restricted",
  tab_closefriends: "Close friends",
  tab_snooze: "Snoozed",
  tab_ign: "Always skip",

  reading: "Reading {n} file(s)...",
  loaded: "Loaded {fo} followers and {fg} following. {n} snapshot(s).",
  compared: "Loaded {n} exports, from {a} to {b}. Unfollowed you and New followers now compare them.",
  needBoth:
    "Need both followers and following. Found {fo} followers and {fg} following. Upload the whole ZIP without unzipping it.",
  cantRead: "Could not read those files ({e}). Use the ZIP, JSON or HTML exactly as Instagram gave it to you.",
  confirmClear: "Clear everything from this tab? Download a backup first if you want to keep it.",
  cleared: "Cleared. Upload a ZIP to start again.",
  bkEnc: "Backup downloaded, locked with your password.",
  bkPlain: "Backup downloaded without a password. Anyone who opens the file can read it.",
  needPw: "This backup is password-protected. Type its password in the box above, then restore again.",
  wrongPw: "Wrong password, or the file is damaged.",
  noCrypto: "This browser cannot lock or unlock backups here. Open the page over https.",
  restored: "Backup restored ({n} snapshots).",
  invalid: "That is not a valid backup ({r}).",
  imgSaved: "Summary image downloaded. It shows counts only, no usernames.",
  noCanvas: "This browser cannot draw the image.",
  shared: "Opened the file you shared.",
  usage:
    "Nothing is saved. {n} snapshot(s) and {a} accounts are held in this tab only, and are gone when you refresh or close it.",
  cardNotBack: "don't follow you back",
  cardSince: "since {d}: +{g} new, -{l} unfollowed"
};

/** @type {Record<string, string>} */
const hi = {
  deltaAgo: "सबसे नया एक्सपोर्ट: {n} दिन पुराना",
  deltaToday: "सबसे नया एक्सपोर्ट: आज का",
  deltaSince: "{d} से +{g} फ़ॉलोअर्स, -{l} अनफ़ॉलो",
  deltaStale: "नई ZIP लेने का समय",
  title: "FOLLOW/BACK - Instagram फ़ॉलो-बैक चेकर",
  sub: "Instagram फ़ॉलो-बैक चेकर। आपके ब्राउज़र में चलता है। कुछ भी अपलोड नहीं होता।",
  priv: "कोई एनालिटिक्स नहीं, कोई CDN नहीं, कोई नेटवर्क अनुरोध नहीं, और ब्राउज़र में कुछ भी सेव नहीं होता: रीफ़्रेश करते ही सब नए सिरे से शुरू होता है। DevTools का Network टैब खोलकर रीलोड करें: यह पेज किसी से बात नहीं करता।",
  lang: "भाषा",
  theme: "लाइट / डार्क",
  snapshots: "स्नैपशॉट",
  insights: "विश्लेषण",
  drop: "Instagram ZIP यहाँ छोड़ें",
  dropSmall: "या चुनने के लिए टैप करें। बीच में किसने अनफ़ॉलो किया, यह देखने के लिए दो ZIP छोड़ें, एक पुरानी और एक नई।",
  howTitle: "अपनी फ़ाइल कैसे पाएँ",
  how1: "Instagram खोलें, Settings में जाएँ, फिर Accounts Center।",
  how2: "Your information and permissions पर टैप करें, फिर Download your information।",
  how3: "सिर्फ़ Followers and following चुनें। फ़ॉर्मेट JSON और तारीख़ की सीमा All time रखें।",
  how4: "डाउनलोड का अनुरोध करें। फ़ाइल तैयार होने पर Instagram ईमेल भेजता है, कुछ मिनटों से कुछ घंटों में।",
  how5: "ZIP डाउनलोड करें और ऊपर वाले बॉक्स में छोड़ें। उसे अनज़िप न करें।",
  howHint:
    "देखना है कि किसने अनफ़ॉलो किया? पिछले महीने की ZIP संभालकर रखें और नई ZIP के साथ दोनों एक साथ छोड़ें। हर एक्सपोर्ट एक स्नैपशॉट बनता है, जिससे ‘आपको अनफ़ॉलो किया’ टैब, टाइमलाइन और इतिहास चार्ट खुलते हैं।",
  bigl: "आपको वापस फ़ॉलो नहीं करते",
  followers: "फ़ॉलोअर्स",
  following: "फ़ॉलोइंग",
  mutual: "आपसी",
  claimPh: "आपकी प्रोफ़ाइल पर दिखने वाले फ़ॉलोअर्स",
  check: "जाँचें",
  searchPh: "यूज़रनेम खोजें",
  sortNew: "नए पहले",
  sortOld: "पुराने पहले",
  all: "सभी",
  alwaysSkip: "हमेशा छोड़ें",
  snooze: "स्नूज़",
  done: "हो गया",
  copy: "कॉपी",
  image: "सारांश चित्र",
  queue: "क्यू मोड",
  open10: "अगले 10 खोलें",
  more: "और दिखाएँ",
  history: "इतिहास",
  snapsHint: "स्नैपशॉट को नाम दें ताकि याद रहे वह क्या था, या गलत तारीख़ की सीमा से अपलोड हुआ स्नैपशॉट हटा दें।",
  backup: "बैकअप",
  backupHint:
    "कुछ भी सेव नहीं होता: पेज रीफ़्रेश या बंद करने पर सब मिट जाता है। बाद के एक्सपोर्ट से तुलना करने के लिए अभी बैकअप डाउनलोड करें और अगली बार रिस्टोर करें, या बस ZIP संभालकर रखें।",
  pwPh: "बैकअप का पासवर्ड (सुझाया गया)",
  bkdl: "बैकअप डाउनलोड करें",
  bkf: "फ़ाइल से रिस्टोर करें",
  clr: "साफ़ करें",
  paste: "इसके बजाय बैकअप पेस्ट करें",
  rs: "टेक्स्ट से रिस्टोर करें",

  tab_notback: "वापस नहीं",
  tab_fans: "आप फ़ॉलो नहीं करते",
  tab_mutual: "आपसी",
  tab_lost: "आपको अनफ़ॉलो किया",
  tab_gained: "नए फ़ॉलोअर्स",
  tab_boomerang: "बूमरैंग",
  tab_timeline: "टाइमलाइन",
  tab_pending: "भेजे गए अनुरोध",
  tab_received: "आए अनुरोध",
  tab_unfollowed: "आपने अनफ़ॉलो किया",
  tab_blocked: "ब्लॉक किए",
  tab_restricted: "प्रतिबंधित",
  tab_closefriends: "क्लोज़ फ़्रेंड्स",
  tab_snooze: "स्नूज़ किए",
  tab_ign: "हमेशा छोड़ें",

  reading: "{n} फ़ाइल पढ़ी जा रही है...",
  loaded: "{fo} फ़ॉलोअर्स और {fg} फ़ॉलोइंग लोड हुए। {n} स्नैपशॉट।",
  compared: "{n} एक्सपोर्ट लोड हुए, {a} से {b} तक। ‘आपको अनफ़ॉलो किया’ और ‘नए फ़ॉलोअर्स’ अब इनकी तुलना करते हैं।",
  needBoth: "फ़ॉलोअर्स और फ़ॉलोइंग दोनों चाहिए। {fo} फ़ॉलोअर्स और {fg} फ़ॉलोइंग मिले। पूरी ZIP बिना अनज़िप किए अपलोड करें।",
  cantRead: "ये फ़ाइलें पढ़ी नहीं जा सकीं ({e})। ZIP, JSON या HTML वैसे ही इस्तेमाल करें जैसे Instagram ने दी थी।",
  confirmClear: "इस टैब से सब कुछ साफ़ करें? रखना हो तो पहले बैकअप डाउनलोड कर लें।",
  cleared: "साफ़ हो गया। फिर से शुरू करने के लिए ZIP अपलोड करें।",
  bkEnc: "बैकअप डाउनलोड हुआ, आपके पासवर्ड से लॉक।",
  bkPlain: "बैकअप बिना पासवर्ड के डाउनलोड हुआ। फ़ाइल खोलने वाला कोई भी इसे पढ़ सकता है।",
  needPw: "यह बैकअप पासवर्ड से सुरक्षित है। ऊपर के बॉक्स में उसका पासवर्ड लिखें, फिर दोबारा रिस्टोर करें।",
  wrongPw: "गलत पासवर्ड, या फ़ाइल खराब है।",
  noCrypto: "यह ब्राउज़र यहाँ बैकअप लॉक या अनलॉक नहीं कर सकता। पेज https पर खोलें।",
  restored: "बैकअप रिस्टोर हुआ ({n} स्नैपशॉट)।",
  invalid: "यह मान्य बैकअप नहीं है ({r})।",
  imgSaved: "सारांश चित्र डाउनलोड हुआ। इसमें सिर्फ़ गिनती है, कोई यूज़रनेम नहीं।",
  noCanvas: "यह ब्राउज़र चित्र नहीं बना सकता।",
  shared: "आपकी शेयर की गई फ़ाइल खोली गई।",
  usage: "कुछ भी सेव नहीं होता। {n} स्नैपशॉट और {a} अकाउंट सिर्फ़ इस टैब में हैं, और रीफ़्रेश या बंद करने पर मिट जाएँगे।",
  cardNotBack: "आपको वापस फ़ॉलो नहीं करते",
  cardSince: "{d} से: +{g} नए, -{l} अनफ़ॉलो"
};

/** @type {Record<string, string>} */
const or = {
  deltaAgo: "ନୂଆତମ ଏକ୍ସପୋର୍ଟ: {n} ଦିନ ପୁରୁଣା",
  deltaToday: "ନୂଆତମ ଏକ୍ସପୋର୍ଟ: ଆଜିର",
  deltaSince: "{d} ରୁ +{g} ଫଲୋଅର୍ସ, -{l} ଅନଫଲୋ",
  deltaStale: "ନୂଆ ZIP ନେବାର ସମୟ",
  title: "FOLLOW/BACK - Instagram ଫଲୋ-ବ୍ୟାକ୍ ଯାଞ୍ଚକାରୀ",
  sub: "Instagram ଫଲୋ-ବ୍ୟାକ୍ ଯାଞ୍ଚକାରୀ। ଆପଣଙ୍କ ବ୍ରାଉଜରରେ ଚାଲେ। କିଛି ଅପଲୋଡ୍ ହୁଏ ନାହିଁ।",
  priv: "କୌଣସି ଆନାଲିଟିକ୍ସ ନାହିଁ, CDN ନାହିଁ, ନେଟୱର୍କ ଅନୁରୋଧ ନାହିଁ, ଏବଂ ବ୍ରାଉଜରରେ କିଛି ସେଭ୍ ହୁଏ ନାହିଁ: ରିଫ୍ରେସ୍ କଲେ ସବୁ ନୂଆରୁ ଆରମ୍ଭ ହୁଏ। DevTools ର Network ଟ୍ୟାବ୍ ଖୋଲି ରିଲୋଡ୍ କରନ୍ତୁ: ଏହି ପେଜ୍ କାହା ସହ କଥା ହୁଏ ନାହିଁ।",
  lang: "ଭାଷା",
  theme: "ଲାଇଟ୍ / ଡାର୍କ",
  snapshots: "ସ୍ନାପସଟ୍",
  insights: "ବିଶ୍ଳେଷଣ",
  drop: "Instagram ZIP ଏଠାରେ ପକାନ୍ତୁ",
  dropSmall: "କିମ୍ବା ବାଛିବା ପାଇଁ ଟ୍ୟାପ୍ କରନ୍ତୁ। ମଝିରେ କିଏ ଅନଫଲୋ କଲା ଦେଖିବାକୁ ଦୁଇଟି ZIP ପକାନ୍ତୁ, ଗୋଟିଏ ପୁରୁଣା ଓ ଗୋଟିଏ ନୂଆ।",
  howTitle: "ଆପଣଙ୍କ ଫାଇଲ୍ କିପରି ପାଇବେ",
  how1: "Instagram ଖୋଲନ୍ତୁ, Settings କୁ ଯାଆନ୍ତୁ, ତା'ପରେ Accounts Center।",
  how2: "Your information and permissions ଟ୍ୟାପ୍ କରନ୍ତୁ, ତା'ପରେ Download your information।",
  how3: "କେବଳ Followers and following ବାଛନ୍ତୁ। ଫର୍ମାଟ୍ JSON ଏବଂ ତାରିଖ ସୀମା All time ରଖନ୍ତୁ।",
  how4: "ଡାଉନଲୋଡ୍ ପାଇଁ ଅନୁରୋଧ କରନ୍ତୁ। ଫାଇଲ୍ ପ୍ରସ୍ତୁତ ହେଲେ Instagram ଇମେଲ୍ ପଠାଏ, କିଛି ମିନିଟରୁ କିଛି ଘଣ୍ଟା ମଧ୍ୟରେ।",
  how5: "ZIP ଡାଉନଲୋଡ୍ କରି ଉପର ବାକ୍ସରେ ପକାନ୍ତୁ। ଏହାକୁ ଅନଜିପ୍ କରନ୍ତୁ ନାହିଁ।",
  howHint:
    "କିଏ ଅନଫଲୋ କଲା ଦେଖିବାକୁ ଚାହାଁନ୍ତି? ଗତ ମାସର ZIP ରଖନ୍ତୁ ଏବଂ ନୂଆ ZIP ସହ ଦୁହିଁକୁ ଏକାଠି ପକାନ୍ତୁ। ପ୍ରତ୍ୟେକ ଏକ୍ସପୋର୍ଟ ଏକ ସ୍ନାପସଟ୍ ହୁଏ, ଯାହା ‘ଆପଣଙ୍କୁ ଅନଫଲୋ କଲେ’ ଟ୍ୟାବ୍, ଟାଇମଲାଇନ୍ ଓ ଇତିହାସ ଚାର୍ଟ ଖୋଲେ।",
  bigl: "ଆପଣଙ୍କୁ ଫେରି ଫଲୋ କରନ୍ତି ନାହିଁ",
  followers: "ଫଲୋଅର୍ସ",
  following: "ଫଲୋଇଂ",
  mutual: "ପାରସ୍ପରିକ",
  claimPh: "ଆପଣଙ୍କ ପ୍ରୋଫାଇଲରେ ଦେଖାଯାଉଥିବା ଫଲୋଅର୍ସ",
  check: "ଯାଞ୍ଚ କରନ୍ତୁ",
  searchPh: "ୟୁଜରନେମ୍ ଖୋଜନ୍ତୁ",
  sortNew: "ନୂଆ ଆଗରେ",
  sortOld: "ପୁରୁଣା ଆଗରେ",
  all: "ସବୁ",
  alwaysSkip: "ସବୁବେଳେ ଛାଡନ୍ତୁ",
  snooze: "ସ୍ନୁଜ୍",
  done: "ହୋଇଗଲା",
  copy: "କପି",
  image: "ସାରାଂଶ ଚିତ୍ର",
  queue: "କ୍ୟୁ ମୋଡ୍",
  open10: "ପରବର୍ତ୍ତୀ 10 ଖୋଲନ୍ତୁ",
  more: "ଅଧିକ ଦେଖାନ୍ତୁ",
  history: "ଇତିହାସ",
  snapsHint: "ସ୍ନାପସଟ୍ କୁ ନାମ ଦିଅନ୍ତୁ ଯେପରି ମନେ ରହିବ, କିମ୍ବା ଭୁଲ ତାରିଖ ସୀମାରେ ଅପଲୋଡ୍ ହୋଇଥିବା ସ୍ନାପସଟ୍ ହଟାନ୍ତୁ।",
  backup: "ବ୍ୟାକଅପ୍",
  backupHint:
    "କିଛି ସେଭ୍ ହୁଏ ନାହିଁ: ପେଜ୍ ରିଫ୍ରେସ୍ କିମ୍ବା ବନ୍ଦ କଲେ ସବୁ ଲିଭିଯାଏ। ପରର ଏକ୍ସପୋର୍ଟ ସହ ତୁଳନା ପାଇଁ ବର୍ତ୍ତମାନ ବ୍ୟାକଅପ୍ ଡାଉନଲୋଡ୍ କରି ପରଥର ରିଷ୍ଟୋର୍ କରନ୍ତୁ, କିମ୍ବା କେବଳ ZIP ରଖନ୍ତୁ।",
  pwPh: "ବ୍ୟାକଅପ୍ ପାସୱାର୍ଡ (ପରାମର୍ଶିତ)",
  bkdl: "ବ୍ୟାକଅପ୍ ଡାଉନଲୋଡ୍",
  bkf: "ଫାଇଲରୁ ରିଷ୍ଟୋର୍",
  clr: "ସଫା କରନ୍ତୁ",
  paste: "ଏହା ବଦଳରେ ବ୍ୟାକଅପ୍ ପେଷ୍ଟ କରନ୍ତୁ",
  rs: "ଟେକ୍ସଟରୁ ରିଷ୍ଟୋର୍",

  tab_notback: "ଫେରି ନାହାଁନ୍ତି",
  tab_fans: "ଆପଣ ଫଲୋ କରୁନାହାଁନ୍ତି",
  tab_mutual: "ପାରସ୍ପରିକ",
  tab_lost: "ଆପଣଙ୍କୁ ଅନଫଲୋ କଲେ",
  tab_gained: "ନୂଆ ଫଲୋଅର୍ସ",
  tab_boomerang: "ବୁମେରାଙ୍ଗ୍",
  tab_timeline: "ଟାଇମଲାଇନ୍",
  tab_pending: "ପଠାଯାଇଥିବା ଅନୁରୋଧ",
  tab_received: "ଆସିଥିବା ଅନୁରୋଧ",
  tab_unfollowed: "ଆପଣ ଅନଫଲୋ କଲେ",
  tab_blocked: "ବ୍ଲକ୍",
  tab_restricted: "ସୀମିତ",
  tab_closefriends: "କ୍ଲୋଜ୍ ଫ୍ରେଣ୍ଡସ୍",
  tab_snooze: "ସ୍ନୁଜ୍ ହୋଇଛି",
  tab_ign: "ସବୁବେଳେ ଛାଡନ୍ତୁ",

  reading: "{n} ଟି ଫାଇଲ୍ ପଢାଯାଉଛି...",
  loaded: "{fo} ଫଲୋଅର୍ସ ଏବଂ {fg} ଫଲୋଇଂ ଲୋଡ୍ ହେଲା। {n} ସ୍ନାପସଟ୍।",
  compared: "{n} ଟି ଏକ୍ସପୋର୍ଟ ଲୋଡ୍ ହେଲା, {a} ରୁ {b} ପର୍ଯ୍ୟନ୍ତ। ‘ଆପଣଙ୍କୁ ଅନଫଲୋ କଲେ’ ଓ ‘ନୂଆ ଫଲୋଅର୍ସ’ ବର୍ତ୍ତମାନ ଏଗୁଡିକୁ ତୁଳନା କରେ।",
  needBoth: "ଫଲୋଅର୍ସ ଓ ଫଲୋଇଂ ଦୁଇଟି ଦରକାର। {fo} ଫଲୋଅର୍ସ ଓ {fg} ଫଲୋଇଂ ମିଳିଲା। ପୂରା ZIP ଅନଜିପ୍ ନକରି ଅପଲୋଡ୍ କରନ୍ତୁ।",
  cantRead: "ଏହି ଫାଇଲଗୁଡିକ ପଢାଯାଇପାରିଲା ନାହିଁ ({e})। Instagram ଦେଇଥିବା ପରି ZIP, JSON କିମ୍ବା HTML ବ୍ୟବହାର କରନ୍ତୁ।",
  confirmClear: "ଏହି ଟ୍ୟାବରୁ ସବୁକିଛି ସଫା କରିବେ? ରଖିବାକୁ ଚାହିଁଲେ ପ୍ରଥମେ ବ୍ୟାକଅପ୍ ଡାଉନଲୋଡ୍ କରନ୍ତୁ।",
  cleared: "ସଫା ହେଲା। ପୁଣି ଆରମ୍ଭ କରିବାକୁ ZIP ଅପଲୋଡ୍ କରନ୍ତୁ।",
  bkEnc: "ବ୍ୟାକଅପ୍ ଡାଉନଲୋଡ୍ ହେଲା, ଆପଣଙ୍କ ପାସୱାର୍ଡରେ ଲକ୍।",
  bkPlain: "ପାସୱାର୍ଡ ବିନା ବ୍ୟାକଅପ୍ ଡାଉନଲୋଡ୍ ହେଲା। ଫାଇଲ୍ ଖୋଲୁଥିବା ଯେକେହି ଏହାକୁ ପଢିପାରିବେ।",
  needPw: "ଏହି ବ୍ୟାକଅପ୍ ପାସୱାର୍ଡ ସୁରକ୍ଷିତ। ଉପର ବାକ୍ସରେ ପାସୱାର୍ଡ ଲେଖି ପୁଣି ରିଷ୍ଟୋର୍ କରନ୍ତୁ।",
  wrongPw: "ଭୁଲ ପାସୱାର୍ଡ, କିମ୍ବା ଫାଇଲ୍ ନଷ୍ଟ ହୋଇଛି।",
  noCrypto: "ଏହି ବ୍ରାଉଜର ଏଠାରେ ବ୍ୟାକଅପ୍ ଲକ୍ କିମ୍ବା ଅନଲକ୍ କରିପାରିବ ନାହିଁ। ପେଜ୍ https ରେ ଖୋଲନ୍ତୁ।",
  restored: "ବ୍ୟାକଅପ୍ ରିଷ୍ଟୋର୍ ହେଲା ({n} ସ୍ନାପସଟ୍)।",
  invalid: "ଏହା ବୈଧ ବ୍ୟାକଅପ୍ ନୁହେଁ ({r})।",
  imgSaved: "ସାରାଂଶ ଚିତ୍ର ଡାଉନଲୋଡ୍ ହେଲା। ଏଥିରେ କେବଳ ସଂଖ୍ୟା ଅଛି, କୌଣସି ୟୁଜରନେମ୍ ନାହିଁ।",
  noCanvas: "ଏହି ବ୍ରାଉଜର ଚିତ୍ର ତିଆରି କରିପାରିବ ନାହିଁ।",
  shared: "ଆପଣ ସେୟାର କରିଥିବା ଫାଇଲ୍ ଖୋଲାଗଲା।",
  usage: "କିଛି ସେଭ୍ ହୁଏ ନାହିଁ। {n} ସ୍ନାପସଟ୍ ଓ {a} ଅକାଉଣ୍ଟ କେବଳ ଏହି ଟ୍ୟାବରେ ଅଛି, ଏବଂ ରିଫ୍ରେସ୍ କିମ୍ବା ବନ୍ଦ କଲେ ଲିଭିଯିବ।",
  cardNotBack: "ଆପଣଙ୍କୁ ଫେରି ଫଲୋ କରନ୍ତି ନାହିଁ",
  cardSince: "{d} ରୁ: +{g} ନୂଆ, -{l} ଅନଫଲୋ"
};

export const LANGS = [
  ["en", "English"],
  ["hi", "हिन्दी"],
  ["or", "ଓଡ଼ିଆ"]
];
/** @type {Record<string, Record<string, string>>} */
export const STRINGS = { en, hi, or };

let current = "en";

/** Pick a language: ?lang= in the address wins, then the browser's languages. */
export function pickLang(search, languages) {
  const q = /[?&]lang=([a-z]{2})/.exec(search || "");
  if (q && STRINGS[q[1]]) return q[1];
  for (const l of languages || []) {
    const two = String(l).slice(0, 2).toLowerCase();
    if (STRINGS[two]) return two;
  }
  return "en";
}

export const getLang = () => current;
export function setLang(l) {
  current = STRINGS[l] ? l : "en";
}

/**
 * Look up a string and fill in {placeholders}.
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, vars) {
  const s = (STRINGS[current] && STRINGS[current][key]) || en[key] || key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Translate every [data-i18n], [data-i18n-ph] and [data-i18n-aria] under `root`. */
export function translatePage(root) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.getAttribute("data-i18n") || "");
  for (const el of root.querySelectorAll("[data-i18n-ph]"))
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph") || ""));
  for (const el of root.querySelectorAll("[data-i18n-aria]"))
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria") || ""));
  if (root.documentElement) {
    root.documentElement.lang = current;
    root.title = t("title");
  }
}
