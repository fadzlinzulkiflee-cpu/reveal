# REVEAL

An original word-guessing game. You get a hint and a hidden word. A countdown runs, and letters flip open one by one as time passes. Guess before time runs out: the earlier you guess, the more points you score.

## Play

Open `index.html` in any browser. It is a single self-contained file with no build step, and it works on phones.

## How it works

- **Language:** English, aimed at adults and families.
- **Rounds:** 10 words per game, with 45, 60 or 90 seconds per word.
- **Reveal:** one letter opens every `time / letters` seconds, in random order. The last letter stays hidden until time runs out.
- **Scoring:** `50 + 100 × (time left / total time) + 15 × hidden letters`. A wrong guess costs 3 seconds.
- **Best score** is kept in the browser's local storage.

## Word list

The starter words and hints live in the `WORDS` array at the top of the script in `index.html` (60 words). Add a word as `["WORD", "Hint text"]`, using letters A–Z only.
