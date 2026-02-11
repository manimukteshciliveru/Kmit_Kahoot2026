# Testing Guide for Quiz Hosting and Joining Fix

## Prerequisites
- Both client and server running
- Two separate browser windows/tabs or browsers
- One faculty account and one student account created

## Step-by-Step Testing

### 1. Start the Server
```bash
cd server
npm run dev
```
(or `npm start` if you prefer non-watch mode)

### 2. Start the Client
```bash
cd client
npm run dev
```

### 3. Test Quiz Hosting and Joining

#### Step 3.1: Faculty Creates and Hosts Quiz
1. Open **Tab 1** in your browser
2. Log in as a **faculty** account
3. Navigate to "Create Quiz" or "My Quizzes"
4. Create a new quiz with at least 2 questions OR select an existing quiz
5. Click "Host Quiz" button
6. You should see:
   - ✓ "Waiting for Students" or similar status
   - ✓ A participant count (should be 0 or increase as students join)
   - ✓ Quiz PIN/Code displayed prominently
   - ✓ Console showing "👤 [Faculty Name] joined quiz: [Quiz Title]"

#### Step 3.2: Student Joins Quiz
1. Open **Tab 2** (or different browser window) with **student** logged in
2. Navigate to "Join Quiz"
3. Enter the 6-character PIN code from Tab 1
4. Click "Join Quiz" button
5. You should be taken to the quiz waiting screen

#### Step 3.3: Verify Real-Time Updates (CRITICAL TEST)
In **Tab 1** (Faculty), you should IMMEDIATELY see:
- ✓ Participant count increase to 1
- ✓ Student name appears in participant list (if list is visible)
- ✓ Toast notification saying "[Student Name] joined!" 
- ✓ Console message: "✓ [Student Name] joined!"

**If you don't see these, it indicates the quiz:joined socket event is not working**

#### Step 3.4: Start the Quiz
1. In **Tab 1** (Faculty), click "Start Quiz" button
2. Verify in **Tab 2** (Student):
   - ✓ "Waiting for quiz..." screen disappears
   - ✓ Quiz appears with first question
   - ✓ Timer starts counting down
   - ✓ Toast notification: "Quiz has started!"

**If student doesn't see the quiz start, the quiz:started event is missing data**

#### Step 3.5: Answer Questions
1. In **Tab 2** (Student), select an answer and submit
2. Verify in **Tab 1** (Faculty):
   - ✓ Toast notification: "[Student Name] answered!"
   - ✓ Answered count increases
   - ✓ Answered participants list updates (if visible)

**If you don't see updates, the answer:feedback event might be missing data**

#### Step 3.6: Advance Questions
1. In **Tab 1** (Faculty), click "Next Question"
2. Verify in **Tab 2** (Student):
   - ✓ Question number increases
   - ✓ New question appears
   - ✓ Timer resets to question time
   - ✓ Previous answer is cleared

**If student doesn't see the new question or timer, the quiz:question event is missing timeLimit**

#### Step 3.7: Complete Quiz
1. Keep advancing through questions in Tab 1 (Faculty)
2. Keep answering in Tab 2 (Student)
3. When last question is reached:
   - In Tab 1: Click "Show Results" button
   - In Tab 2: Quiz automatically shows completion screen
4. Verify both see:
   - ✓ Leaderboard/Results displayed
   - ✓ Scores calculated correctly
   - ✓ Rankings shown

## Troubleshooting

### Issue: Student doesn't see participants count
- Check: Console for "Quiz joined" messages
- Fix: Ensure quiz:joined event is being sent by socket handler

### Issue: Faculty doesn't see student join
- Check: 
  - Is the student's browser showing "Waiting for quiz..." screen?
  - Is socket.io connection showing in student's console?
  - Faculty console should show participant:joined event
- Fix: Ensure socket:join event is properly received and Response document created

### Issue: Student doesn't receive quiz start
- Check:
  - Faculty successfully started quiz?
  - Student's WebSocket still connected (no disconnect message)?
- Fix: Check that quiz:started event includes questions and questionTimer

### Issue: Timer doesn't show or is wrong value
- Check: quiz:started event in socket handler includes questionTimer
- Fix: Verify timeLimit is calculated properly for each question

### Issue: Score doesn't update for student
- Check: answer:feedback event in socket includes totalScore
- Fix: Verify response.totalScore is being properly set

## Console Debugging

Watch the browser console (F12) for these key messages:

**Faculty Console:**
- "👤 [Name] joined quiz: [Title]" - socket connection
- "Participant joined event received:" - student joining
- "Response received from: [Name]" - student answering

**Student Console:**
- "🔌 Socket connected" - socket.io connection
- "Quiz joined event received" - socket:join acknowledged  
- "Quiz has started!" - quiz:started received
- "Quiz:question" - new question pushed

## Performance Notes

- All socket events should be near-instantaneous (< 100ms)
- If there's delay > 1 second, check network in DevTools
- Multiple rapid joins should handle gracefully

## Verification Checklist

- [ ] Faculty can host quiz from one window
- [ ] Student can join from another window
- [ ] Faculty sees student join in real-time
- [ ] Student receives quiz start notification
- [ ] Faculty sees student responses in real-time
- [ ] Student sees next question updates
- [ ] Scores update correctly for both sides
- [ ] Quiz can be completed successfully

## Report Issues

If you encounter any issues:
1. Note which step fails
2. Check browser console (F12) for error messages
3. Check server console for error logs
4. Verify network requests in DevTools Network tab
5. Check if socket events are being sent/received correctly

