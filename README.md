# Multiplayer Hide & Seek Game

A real-time multiplayer Hide & Seek game where players can join while the game is in progress. New players automatically become hunters when they join.

## How to Play

1. Enter your name and either create a new game or join an existing one
2. If creating a game, share the game code with friends
3. The game starts with one hider and all other players as hunters
4. Hiders try to avoid being caught for 3 minutes
5. Hunters try to catch all hiders before time runs out
6. Any player who joins after the game starts becomes a hunter
7. If a hider is caught, they become a hunter

## Setup for GitHub Pages

1. Create a new GitHub repository
2. Add these files to the repository:
   - `index.html`
   - `style.css`
   - `script.js`
3. Go to Settings > Pages and enable GitHub Pages for the main branch
4. The game will be available at `https://[your-username].github.io/[repository-name]/`

## Technical Details

- Uses PeerJS for peer-to-peer connections
- p5.js for game rendering
- No server required (hosted peer acts as the game server)
- Works on modern browsers with WebRTC support

## Credits

Created for GitHub deployment. Uses PeerJS and p5.js libraries.