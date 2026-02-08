import styles from "./page.module.css";

export default function RulesPage() {
    return (
        <div>
            <h1 className={styles.sectionTitle}>Retro Game Gauntlet Rules</h1>
            <div>
                Have you ever wanted to play shitty games that suck ass? No? Sucks for you.
                <br />
                <br />
                A "gauntlet" consists of several heats, each with a defined set of retro platforms and a start and end date.
                <br />
                <br />
                Before each heat, each player rolls a set of X games from the platforms that are included in that heat. They
                then pick 1 from that pool of games they want to try and beat within that heat's timeframe.
                <br />
                <br />
                If you can beat that game within the timeframe, you get a point. If not, you don't. Most points by the end of
                the last heat wins.
                <br />
                <br />
                Good luck?
            </div>

            <h3 className={styles.sectionTitle}>Rolling</h3>
            <div>
                Rolling must be witnessed by at least one other participant of that gauntlet to ensure no funny business. <br />
                You can decide how many of each platform you want to include in your roll pool before rolling, but each platform must have at least one game included. <br />
                Example: If a heat includes NES and SNES and 10 picks, you could:
                <div>
                    <ul>
                        <li>Roll 5 NES and 5 SNES games</li>
                        <li>Roll 2 NES and 8 SNES games</li>
                        <li>Roll 1 NES and 9 SNES games</li>
                        <li>etc.</li>
                    </ul>
                    But you could not:
                    <ul>
                        <li>Roll 0 NES and 10 SNES games</li>
                        <li>Roll 10 NES and 0 SNES games</li>
                    </ul>
                </div>
                After rolling, you must pick one game from your rolled pool to be your target for that heat.
            </div>

            <h3 className={styles.sectionTitle}>Technical Vetos</h3>
            <div>
                It's possible to roll games that simply cannot be acquired, or don't run, or maybe aren't games or retro games
                at all. These games can be vetoed and removed from your roll pool for free, but you must have one other gamer
                confirm it with you. <br />
                The same goes for games that aren't available in English language. Note that you're totally allowed to try and beat a fully Japanese/Italian/German game, you just don't have to.
            </div>

            <h3 className={styles.sectionTitle}>Glitches, Bugs, Exploits, "Cheating"</h3>
            <div>
                Look man, I'm not a cop - if you find a bug or exploit in a game that lets you beat it faster/easier, no one will care, but it'd be pretty lame to look up walkthroughs or speedrun strats online. <br />
            </div>
        </div>
    );
}