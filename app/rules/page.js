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
                Oh, and if at all possible, you should be streaming that game on Discord to the other gamers. 
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
                After rolling, you must pick one game from your rolled pool to be your target for that heat. <br />
            </div>

            <h3 className={styles.sectionTitle}>Punishments and bonuses</h3>
            <div>
                Some gauntlets have optional effects enabled: beating heats earns you a random powerup, and giving up on a heat applies a penalty to your next heat.
                <br />
                <br />
                If you beat a heat, you earn 1 random powerup:
                <ul>
                    <li>#1: 1x +3 roll pool for one heat - heat platform restrictions apply</li>
                    <li>#2: 1x one bonus roll on a platform of free choice</li>
                    <li>#3: 4x move the wheel selection by 1 slot after spinning </li>
                    <li>#4: 2x veto - full reroll of a rolled game for any reason </li>
                </ul>
                These persist until used (per gauntlet), and you can use them at any time during a heat as long as the conditions for that powerup are met. <br />
                <br />
                If you give up on a heat, you get a one-time -2 pool penalty for your next heat (minimum pool is still 1). <br />
                This means if your next heat would normally have a pool of 10 games, it will be reduced to 8 games. If the heat would normally have a pool of 3 games, it will be reduced to 1 game. <br />
                The penalty applies even if you use a +3 powerup, so if your next heat would normally have a pool of 10 games and you use a +3 powerup, your pool would be 11 games but then reduced to 9 games after the penalty. <br />
            </div>

            <h3 className={styles.sectionTitle}>Versions</h3>
            <div>
                You can deviate from the exact roll in two ways: <br />
                <ol>
                    <li>If the game has a different version of the same game on the same platform (like, Metal Gear Solid 3: Subsistence vs. Metal Gear Solid 3: Snake Eater), you may play whatever version you want.</li>
                    <li>If the game has a modern port to PC, and the game is reasonably the same (like, The Thing Remastered for PC vs. The Thing on PlayStation 2), you may play it on PC if you find that easier than emulating.</li>
                </ol>
                In either case, make sure to confirm with your fellow gauntlet participants. <br />
                Otherwise you must play that game in the exact version that was rolled, whether that be on the actual console, through fan emulation or an official emulation release like Virtual Console or PlayStation Classics, etc. <br />
                <br />
                If you roll a collection release of games that were released individually, you get to pick any of them. For example, Duck Hunt and Super Mario Bros. were released together as a cartridge on NES, but also separately on various platforms - if you roll that combined release, you can pick either Duck Hunt or Super Mario Bros. to be your target for that heat. <br />
            </div>

            <h3 className={styles.sectionTitle}>Beating a game</h3>
            <div>
                For most linear titles, beating the game is defined as reaching the end credits or ending screen. If there is credits to reach, that must be your objective. <br />
                For more arcade style games that don't have any credits, you'll just have to set a goal for a high score or stage that would be widely accepted as "yeah, that bloke seems to have beaten that there videogame". Idk, you figure it out. Talk with the others and set a target.<br />
            </div>


            <h3 className={styles.sectionTitle}>Technical Vetos</h3>
            <div>
                It's possible to roll games that simply cannot be acquired, or don't run, or maybe aren't games or aren't retro. These games can be vetoed and removed from your roll pool for free, but you must have one other gamer
                confirm it with you. <br />
                The same goes for games that aren't available in English language. Note that you're totally allowed to try and beat a fully Japanese/Italian/German game, you just don't have to. <br />
                You may also veto games you've already played, but you're also allowed to try and beat them again if you want. <br />
            </div>

            <h3 className={styles.sectionTitle}>Glitches, Bugs, Exploits, "Cheating"</h3>
            <div>
                Look man, I'm not a cop - if you find a bug or exploit in a game that lets you beat it faster/easier, no one will care, but it'd be pretty lame to look up walkthroughs or speedrun strats online. <br />
            </div>
        </div>
    );
}