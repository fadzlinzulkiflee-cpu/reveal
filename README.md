# REVEAL

An original word-guessing game. You get a hint and a hidden word. A countdown runs, and letters flip open one by one as time passes. Guess before time runs out: the earlier you guess, the more points you score.

## Play

Open `index.html` in any browser for Solo. There is no build step, and it works on phones.

For big-screen games, the files must be served from a web address (for example GitHub Pages), not opened as a local file:

1. Open `host.html` on the TV, laptop or tablet. It opens a room and shows a QR code and a 4-character code.
2. Players scan the QR code (or open `play.html` and type the code) and enter their name.
3. Start from the big screen, or from the phone of the first player who joined (marked ★).

## How it works

- **Language:** English, aimed at adults and families.
- **Modes:**
  - *Solo:* chase your best score. A wrong guess costs 3 seconds.
  - *Party (big screen):* everyone guesses the same word on their own phone. Every correct guess scores, faster scores more, and the first correct guess gets +25. A wrong guess locks that phone for 3 seconds. 10 words.
  - *Royale (big screen, 2–12 players):* same word for everyone. A wrong guess, or not answering before time runs out, disqualifies you, and so does the slowest correct answer. The TV shows a live ranking with answer times and how many players remain. If nobody gets it, nobody is out. Last one standing wins.

- **Rounds:** 10 words per game, with 20, 30 (default) or 45 seconds per word.
- **Reveal:** one letter opens every `time / letters` seconds, in random order. The last letter stays hidden until time runs out.
- **Scoring:** `50 + 100 × (time left / total time) + 15 × hidden letters`. In Solo a wrong guess costs 3 seconds.
- **Best score** is kept in the browser's local storage.

## How big-screen mode connects

Phones and the big screen talk peer to peer with [PeerJS](https://peerjs.com) (WebRTC). The free public PeerJS server only introduces the devices; game data goes directly between them, and no account or server of our own is needed. It works best when everyone is on the same Wi-Fi. Some mobile networks block direct connections; those players should join the Wi-Fi.

To use your own PeerJS server, add `?peerhost=HOST&peerport=PORT&peerpath=/PATH` to the `host.html` URL. The join link passes it on to phones.

## Files

- `index.html`: Solo
- `host.html`: big screen (Party and Royale)
- `play.html`: phone controller for big-screen games
- `words.js`: the shared word list
- `party.css`, `net.js`: shared styles and connection settings for big-screen mode
- `theme.css`: the REVEAL brand (forest green, lime, Archivo Black wordmark), loaded last on every page
- `stage.css`, `stage.js`: the game-show look of the guessing screen (countdown ring, gold tiles, confetti), used by every mode
- `vendor/`: PeerJS 1.5.4 and qrcode-generator 1.4.4 (MIT), kept in the repo so the game does not depend on a CDN

## Word list

The starter words and hints live in `words.js` (60 words), shared by every mode. Add a word as `["WORD", "Hint text"]`, using letters A–Z only.
