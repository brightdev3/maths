# Mathex fair play controls

Hosts can choose these controls when creating a room or change them under **Game options**:

- **Restrict question copying and answer pasting** blocks copy/cut actions involving questions and paste/drop actions in answer forms. This includes answers submitted from the sketch pad. Chat and unrelated inputs are not restricted.
- **Restrict question context menus and dragging** disables question text selection, context menus and dragging, including question images. It reduces easy access to image-search menu entries but cannot disable Google Lens itself.
- **Warn when the game window loses focus** reports focus loss while the game tab remains visible. There is a short delay to avoid duplicating tab-switch flags. Browser dialogs, accessibility tools and other innocent actions can cause this warning.

All additional controls default to **off**. Existing tab-leaving tracking remains a separate option. Restrictions and reporting apply only while the player is actively playing, not in the lobby or after they finish. Players see the enabled controls before and during play, and receive a notice when an activity warning occurs.

## Host review

Each player's card in both dashboard layouts has an expandable **activity warnings** section showing counts by action, plus the latest time and question. The activity log retains each accepted warning. Warnings are private to the host, do not increase tab-leaving flags and never change scores or automatically kick players.

The server accepts only known action types enabled by the host, for a joined player who is still playing. It assigns the time and question number, and groups repeated actions of the same type within five seconds (including across reconnects). Per-player summaries are bounded by the seven supported action types and persist with the room. Clipboard contents, images, extension lists and other page contents are not collected.

## Limits and accessibility

A normal web page cannot reliably detect installed extensions or prevent browser/OS screenshots, Google Lens overlays, developer tools or use of another device. Client-side controls and reports can be bypassed. An absence of warnings is not proof that a player used no outside help; a warning is not proof of cheating. Review activity with the player rather than imposing automatic penalties.

Avoid enabling restrictions that interfere with a player's assistive technology or legitimate workflow. Use supervision and clear competition rules where stronger guarantees are needed. These controls intentionally do not request camera, microphone, screen-recording or extension permissions, or disable normal keyboard navigation.

## Manual checks

1. Create a room with each control off: normal selection, copying, pasting, dragging and context menus should work; no activity warnings should appear.
2. Enable clipboard restrictions. Copy/cut a selected question, paste an answer, and drop text into an answer: the action should be blocked, with a player notice and a host warning. Typing and copying your own answer should still work. Repeat in the sketch pad's question/interact view. Pasting in chat must still work.
3. Enable question-content restrictions. Check right-click and image/text dragging in both question views. Verify answer and chat context menus remain usable. Text selection is prevented silently, not counted as a warning.
4. Enable focus warnings. Focus another window while the tab stays visible; the host should see a focus warning. Switch tabs: existing tab tracking should work without an additional focus warning for the same transition.
5. Repeat one action rapidly: expect at most one warning of that kind per five seconds. Reconnect: summaries should remain. Try unknown event names or disabled controls: the server should ignore them.
6. Toggle controls during play and verify the new policy takes effect. Finish one player while others continue: restrictions and reporting must stop for the finished player, but chat should continue.
7. Check both host list and tile layouts, including mobile, for warning details distinct from tab flags. Restart the server and verify saved summaries and settings remain.
