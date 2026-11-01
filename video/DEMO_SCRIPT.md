# Demo video script (silent, no editing)

Length: about 4 minutes. Record it in **one take**. The slides do the explaining, so you don't need to speak or edit.

Each step says what to **click**, **type** or **wait** for. Go slowly: move the mouse to the thing you're showing and let it rest for 2–3 seconds.

---

## A. Setup (before you press record)

1. Make sure the **redesigned version is live** (Claude pushes it; Render redeploys in ~3 min).
2. Open **Chrome → New Incognito window** (`Ctrl + Shift + N`).
3. **Tab 1:** open this file in Incognito:
   `D:\Code_stuff\Promptwars\C05\video\slides.html`
   (drag the file into the Incognito window).
4. **Tab 2:** open your **live Render URL**. Wait until the badge top-right says **"Gemini online"**. If it says "AI offline", the API key isn't set on Render; fix that first.
5. **Tab 3:** open `https://github.com/mk12002/05_Celebrate`.
6. Set zoom to 100% on every tab (`Ctrl + 0`).
7. Go back to **Tab 1** (slides) and press **F11** for full screen. Switch tabs with `Ctrl + 1` / `Ctrl + 2` / `Ctrl + 3`; this works in full screen.
8. Keep this checklist open on your phone or a second screen.

**Recording:** press **Win + Alt + R** to start and stop (Windows Game Bar records the Chrome window). The video is saved in `Videos\Captures`.

---

## B. Recording

### 1. Intro slides (~25 s)
1. **Win + Alt + R** to start recording. You're on the title slide. **Wait 5 s.**
2. Press **→**. "How the AI is used" slide. **Wait 12 s** (viewers need time to read it).
3. Press **→**. "Let's plan a wedding in Jaipur." **Wait 3 s.**

### 2. The planner form (~45 s)
4. Press **Ctrl + 2** (the app).
5. Slowly move the mouse down the 5 feature points on the left (1 s each).
6. Click the **Wedding** tile (already selected; click anyway to show it).
7. Click **Event name**, type: `Asha & Leo`
8. **Date:** click the calendar icon and pick a date **about 3 months from today** (e.g. 8 Feb 2027).
9. **Guests:** select the field, type `180`
10. **Total budget:** select the field, type `2500000`
11. **Currency:** choose **INR (₹)**
12. **Location:** type `Jaipur, India`
13. **Setting:** choose **Outdoor**
14. **Vibe:** type `Royal Rajasthani with modern touches`
15. **Preferences & must-haves:** type
    `Vegetarian menu, live folk music, eco-friendly decor, wheelchair access`

### 3. Generate (~25 s, real wait)
16. Click **✦ Generate my plan**.
17. **Don't touch anything.** The button shimmers and the progress messages change. Rest the mouse near the status text. Gemini takes about 15–30 s.

### 4. Overview (~15 s)
18. The plan appears. Hover over the **colour stripe** at the top (this is the AI's theme palette).
19. Hover over the **days-to-go** card, then read along the **summary** paragraph with the mouse.
20. Hover over the stat tiles, then **Next steps**, then **Book first**.
21. Hover over the line at the bottom: **"Generated with Google Gemini (…)"**. **Wait 2 s.**

### 5. Budget (~20 s)
22. Click the **Budget** tab.
23. Hover over the **donut**, then the 4 fact tiles.
24. Scroll down slowly through the table. Pause on the **Tip** column (Gemini's notes) and on **Contingency buffer**.
25. Pause on the **Total** row (it matches the budget exactly).

### 6. Timeline (~20 s)
26. Scroll back up and click the **Timeline** tab.
27. Hover over the **"Start now"** badge on the first phase.
28. **Tick the first 2 checkboxes** in the first phase. The progress bar and "2/x done" update.
29. Scroll down slowly through the phases to **Day-of schedule**. Pause 3 s.

### 7. Vendors (~20 s)
30. Scroll up and click the **Vendors** tab.
31. On the **first card** (red "Critical: book first"), change **Status** to **Booked**. The card turns green and "1 of N booked" updates.
32. On the same card, click **Questions to ask** to expand it. Pause 3 s.
33. Hover over the **estimate** on 2 other cards.

### 8. Theme (~20 s)
34. Scroll up and click the **Theme** tab.
35. Hover over the theme name and concept, then each **colour swatch**.
36. Scroll down past **Decor / Activities / Menu**.
37. Pause on the **invitation card** for 3 s, then click **Copy invitation text**.

### 9. Chat: budget change (~30 s)
38. Scroll up and click the **Budget** tab. Hover over the **Catering** row amount (remember the number).
39. In the right-hand panel, click the chip
    **"Reduce the catering budget by 10% and reallocate it to live music"**.
40. Wait. You'll see **"Gemini is thinking…"**, then a reply with a **green list of changes**. Hover over the green list.
41. Look at the Budget table: **Catering went down, Music/Entertainment went up, Total unchanged.** Hover over each of those three rows.

### 10. Chat: rainy-day plan (~25 s)
42. Click the chip **"Suggest indoor backup activities for rainy weather"**.
43. Wait for the reply, then click the **Theme** tab and scroll to **Activities & agenda**. The new indoor ideas are listed there.

### 11. Chat: your own request (~25 s)
44. Click the chat box and type:
    `Add a mehendi night the evening before and a task to book a henna artist`
45. Press **Enter**. Wait for the reply.
46. Click the **Timeline** tab and scroll until you find the new task. Hover over it.

### 12. Extras (~15 s)
47. Scroll to the top and click **Add to calendar (.ics)**. The download appears in Chrome; hover over it for 2 s.
48. Press **F5** to reload. The plan, ticked tasks and chat are all still there. Pause 3 s.

### 13. Code (~20 s)
49. Press **Ctrl + 3** (GitHub).
50. Scroll slowly through the README: the feature table, the **architecture diagram**, then the **Prompts** section. Pause 3 s on each.

### 14. Outro slides (~15 s)
51. Press **Ctrl + 1** (slides) and press **→**. "Under the hood" slide. **Wait 10 s.**
52. Press **→**. Thank-you slide. **Wait 4 s.**
53. **Win + Alt + R** to stop.

---

## C. If something goes wrong while recording

| Problem | What to do |
|---|---|
| Yellow notice "Gemini is busy… built-in templates" | Click **Edit details** → **Generate my plan** again. Keep recording; it looks fine. |
| A chat reply says it couldn't do something | Click the chip again, or move to the next step. |
| Page takes 40+ s on first load | The free server was asleep. Always open the URL once during setup (step A4). |
| You make a big mistake | Stop, press `Ctrl + Shift + N` for a fresh window, and start again from setup. |

---

## D. Upload

1. Open `C:\Users\<you>\Videos\Captures` and find the newest `.mp4`.
2. Upload it to **YouTube** as **Unlisted** (or Google Drive: Share → "Anyone with the link").
3. Open the link in a private window to check it plays.
4. Paste that link into the **Project Demo Video** field.
