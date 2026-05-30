begin;

lock table public.locations in share row exclusive mode;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.locations
    WHERE id = '11'
  ) THEN
    RAISE EXCEPTION 'Cannot seed Crow''s Den adventure catalog: locations.id=11 is missing';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.locations'::regclass
      AND tgname = 'update_locations_updated_at'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.locations DISABLE TRIGGER update_locations_updated_at;
  END IF;
END $$;

update public.locations
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'adventureCatalog',
  jsonb_build_object(
    'defaults',
    jsonb_build_object(
      'arcSummary', 'The Crow''s Den is a shuttered taproom, rookery, and salt cellar caught between old tavern bargains and the Carrion Court''s quiet claim on every route below.',
      'currentStakes', 'The characters must learn who is baiting the bell, which passage can be trusted, and what the Crow Mother wants before the Den seals them into someone else''s bargain.',
      'openingDecision', jsonb_build_object(
        'id', 'crows-den-opening-choice',
        'prompt', 'Which Crow''s Den hook does the group answer first?',
        'options', jsonb_build_array(
          jsonb_build_object('id', 'quiet-bell', 'label', 'Quiet the bell rope', 'summary', 'Approach the bar and stop the rope before it calls more attention from the rafters.'),
          jsonb_build_object('id', 'take-cellar-stair', 'label', 'Take the cellar stair', 'summary', 'Descend toward the salt door while the upper room watches from the beams.'),
          jsonb_build_object('id', 'bargain-with-keeper', 'label', 'Question the keeper', 'summary', 'Press Mother Marrow for the price of safe passage and the names she will not say.'),
          jsonb_build_object('id', 'mark-rookery-route', 'label', 'Mark the rookery route', 'summary', 'Climb or map the rafters before the shutters decide which exits stay open.')
        )
      ),
      'discoveries', jsonb_build_array(
        'The bell rope moves even when the taproom air is still.',
        'Black feathers collect near the cellar stair instead of the rafters.',
        'Mother Marrow knows every token that has crossed the long table, but she will not name the Carrion Court aloud.',
        'The old smuggler map under the bar shows one passage ending at the oubliette well and another at a bricked shrine.',
        'The salt door opens more readily for a remembered kindness than for force.',
        'A three-scratch mark means the rookery path loops back; a single white feather means it leads lower.'
      ),
      'clocks', jsonb_build_array(
        jsonb_build_object(
          'id', 'crows-den-rafters',
          'label', 'Rafter Attention',
          'value', 0,
          'max', 6,
          'summary', 'Each loud choice or ignored omen draws more watcher movement through the beams and shutters.'
        ),
        jsonb_build_object(
          'id', 'crows-den-salt-door-patience',
          'label', 'Salt Door Patience',
          'value', 0,
          'max', 6,
          'summary', 'The cellar door becomes less willing to open cleanly as bargains are broken or delayed.'
        ),
        jsonb_build_object(
          'id', 'crows-den-court-notice',
          'label', 'Carrion Court Notice',
          'value', 0,
          'max', 8,
          'summary', 'Masked jurors, crow signs, and oath marks gather until the Court demands an answer in the taproom.'
        )
      )
    ),
    'sections',
    jsonb_build_object(
      '00_setting', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-shuttered-taproom', 'section', '00_setting', 'title', 'Shuttered Taproom', 'summary', 'The public room keeps its chairs stacked, its hearth cold, and its bell rope centered above the bar like a hanging question no patron should answer lightly.', 'tags', jsonb_build_array('taproom', 'bell', 'hearth', 'bar')),
        jsonb_build_object('id', 'crows-den-rookery-overhead', 'section', '00_setting', 'title', 'Rookery Overhead', 'summary', 'Rafters, shutters, and crawlways form a second floor of watching birds, old nests, and handholds polished by years of silent traffic.', 'tags', jsonb_build_array('rafters', 'rookery', 'shutters', 'routes')),
        jsonb_build_object('id', 'crows-den-salt-below', 'section', '00_setting', 'title', 'Salt Below', 'summary', 'The cellar smells of wet salt, sour ale, and sealed stone; every cask casts a shadow that points toward the same lower door.', 'tags', jsonb_build_array('cellar', 'salt', 'casks', 'door')),
        jsonb_build_object('id', 'crows-den-bargain-house', 'section', '00_setting', 'title', 'Bargain House', 'summary', 'The Den remembers oaths as if they were spilled drink: promises stain tables, alter routes, and make the wrong words echo back later.', 'tags', jsonb_build_array('oaths', 'bargains', 'echoes', 'memory')),
        jsonb_build_object('id', 'crows-den-threshold', 'section', '00_setting', 'title', 'Threshold of WAGDIE', 'summary', 'Outside noise falls away at the lintel, leaving only feather-rustle, rope-creak, and the sense that the tavern is choosing who may leave by which door.', 'tags', jsonb_build_array('threshold', 'silence', 'doors', 'omens'))
      ),
      '10_plot', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-bell-bait-plot', 'section', '10_plot', 'title', 'Who Baits the Bell', 'summary', 'Someone keeps setting the bell to call intruders toward the bar while another hand opens the cellar path in the confusion.', 'tags', jsonb_build_array('bell', 'bait', 'bar', 'cellar'), 'relatedEntryIds', jsonb_build_array('crows-den-bell-bait', 'crows-den-bell-rope-piper')),
        jsonb_build_object('id', 'crows-den-marrow-ledger-plot', 'section', '10_plot', 'title', 'Mother Marrow''s Ledger', 'summary', 'Mother Marrow can trade names, routes, and old favors, but every answer she gives exposes a debt someone in the room hoped to keep buried.', 'tags', jsonb_build_array('marrow', 'ledger', 'debts', 'names'), 'relatedEntryIds', jsonb_build_array('crows-den-mother-marrow', 'crows-den-tally-ledger')),
        jsonb_build_object('id', 'crows-den-salt-door-plot', 'section', '10_plot', 'title', 'The Salt Door Wants Courtesy', 'summary', 'The lower door refuses simple pressure and instead responds to offerings, remembered favors, careful silence, or the right crow-marked token.', 'tags', jsonb_build_array('salt', 'door', 'courtesy', 'offerings'), 'relatedEntryIds', jsonb_build_array('crows-den-salt-door', 'crows-den-salt-key')),
        jsonb_build_object('id', 'crows-den-court-summons-plot', 'section', '10_plot', 'title', 'Carrion Court Summons', 'summary', 'The Carrion Court uses the Den as an antechamber, sending jurors to test whether visitors understand oath, appetite, and witness.', 'tags', jsonb_build_array('court', 'jurors', 'oath', 'witness'), 'relatedEntryIds', jsonb_build_array('crows-den-carrion-court', 'crows-den-carrion-juror')),
        jsonb_build_object('id', 'crows-den-smuggler-map-plot', 'section', '10_plot', 'title', 'The Smuggler Map Lies Twice', 'summary', 'A map under the bar marks three exits, but two labels have been swapped to punish anyone who trusts ink over signs in the room.', 'tags', jsonb_build_array('map', 'routes', 'bar', 'misdirection'), 'relatedEntryIds', jsonb_build_array('crows-den-smuggler-map', 'crows-den-backroom-map')),
        jsonb_build_object('id', 'crows-den-crow-mother-plot', 'section', '10_plot', 'title', 'Crow Mother''s Missing Chick', 'summary', 'A tiny bone charm from the rookery has gone missing, and its absence makes every bird in the Den more willing to accuse than guide.', 'tags', jsonb_build_array('crow-mother', 'charm', 'rookery', 'accusation'), 'relatedEntryIds', jsonb_build_array('crows-den-rookery-kin', 'crows-den-bone-charm'))
      ),
      '20_characters', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-mother-marrow', 'section', '20_characters', 'title', 'Mother Marrow', 'summary', 'The Den''s keeper has pearl eyes, blackened fingers, and perfect manners; she protects the house by making guests speak their wants plainly.', 'tags', jsonb_build_array('keeper', 'marrow', 'bargain', 'manners'), 'relatedEntryIds', jsonb_build_array('crows-den-marrow-ledger-plot', 'crows-den-long-table')),
        jsonb_build_object('id', 'crows-den-rope-boy', 'section', '20_characters', 'title', 'The Rope Boy', 'summary', 'A soot-thin errand child appears near the bell rope whenever no one is looking directly, warning helpful guests with small knots and misleading cruel ones with pretty bows.', 'tags', jsonb_build_array('child', 'bell', 'knots', 'warnings'), 'relatedEntryIds', jsonb_build_array('crows-den-bell-rope', 'crows-den-rope-knot')),
        jsonb_build_object('id', 'crows-den-auntie-caw', 'section', '20_characters', 'title', 'Auntie Caw', 'summary', 'An old roof-sleeper in a feather shawl knows the rafters better than the floor and trades guidance for gossip that will embarrass the proud.', 'tags', jsonb_build_array('guide', 'rafters', 'gossip', 'shawl'), 'relatedEntryIds', jsonb_build_array('crows-den-rookery-path')),
        jsonb_build_object('id', 'crows-den-vellum-jack', 'section', '20_characters', 'title', 'Vellum Jack', 'summary', 'A smuggler-scribe hiding behind the bottle racks keeps revising the underbar map so no pursuer and no friend can follow the same route twice.', 'tags', jsonb_build_array('smuggler', 'scribe', 'map', 'bottles'), 'relatedEntryIds', jsonb_build_array('crows-den-smuggler-map')),
        jsonb_build_object('id', 'crows-den-quiet-bride', 'section', '20_characters', 'title', 'The Quiet Bride', 'summary', 'A veiled figure sits where a wedding party should have gathered, answering only with tapped glass and pointing toward names scratched below the table lip.', 'tags', jsonb_build_array('bride', 'veil', 'table', 'names'), 'relatedEntryIds', jsonb_build_array('crows-den-long-table')),
        jsonb_build_object('id', 'crows-den-barrow-factor', 'section', '20_characters', 'title', 'Barrow-Factor Nix', 'summary', 'A mud-booted factor arrives through the cellar with invoices for impossible storage and a habit of measuring guests as if they were cargo.', 'tags', jsonb_build_array('factor', 'cellar', 'cargo', 'invoices'), 'relatedEntryIds', jsonb_build_array('crows-den-salt-cellar')),
        jsonb_build_object('id', 'crows-den-three-mask-clerk', 'section', '20_characters', 'title', 'Three-Mask Clerk', 'summary', 'A Carrion Court clerk rotates three bird masks during conversation: one listens, one records, and one smiles when a visitor contradicts an earlier oath.', 'tags', jsonb_build_array('court', 'clerk', 'masks', 'oaths'), 'relatedEntryIds', jsonb_build_array('crows-den-carrion-court', 'crows-den-carrion-juror')),
        jsonb_build_object('id', 'crows-den-lantern-sister', 'section', '20_characters', 'title', 'Lantern Sister Pell', 'summary', 'A patient lantern-tender keeps one warm light alive by the stair and asks travelers to carry news to those who never returned upward.', 'tags', jsonb_build_array('lantern', 'stair', 'news', 'tender'), 'relatedEntryIds', jsonb_build_array('crows-den-last-lantern'))
      ),
      '30_monsters', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-rafter-crow-wight', 'section', '30_monsters', 'title', 'Rafter Crow-Wight', 'summary', 'An ash-black crow-wight folds itself among the beams, speaks in borrowed tavern whispers, and drops near the bell rope when someone ignores a warning knot.', 'tags', jsonb_build_array('crow', 'rafters', 'bell', 'wight'), 'relatedEntryIds', jsonb_build_array('crows-den-rookery-overhead', 'crows-den-rope-knot')),
        jsonb_build_object('id', 'crows-den-salt-cask-prowler', 'section', '30_monsters', 'title', 'Salt-Cask Prowler', 'summary', 'A salt-caked cellar prowler drags hook-shaped nails across casks, herds intruders toward the lowest stair, and backs away from steady lantern warmth.', 'tags', jsonb_build_array('cellar', 'salt', 'casks', 'prowler'), 'relatedEntryIds', jsonb_build_array('crows-den-salt-cellar', 'crows-den-last-lantern')),
        jsonb_build_object('id', 'crows-den-carrion-juror', 'section', '30_monsters', 'title', 'Carrion Juror', 'summary', 'A masked carrion juror perches at the long table, judges answers with beak-click rhythm, and punishes rushed speech by making exits seem farther away.', 'tags', jsonb_build_array('table', 'carrion', 'juror', 'oath'), 'relatedEntryIds', jsonb_build_array('crows-den-long-table', 'crows-den-court-summons-plot')),
        jsonb_build_object('id', 'crows-den-shutter-rook-swarm', 'section', '30_monsters', 'title', 'Shutter Rook-Swarm', 'summary', 'A ragged rook-swarm pours through broken shutters as a single dark sheet, splits around lantern light, and reforms near exits that careless guests rely on.', 'tags', jsonb_build_array('rookery', 'shutters', 'lanterns', 'exits'), 'relatedEntryIds', jsonb_build_array('crows-den-shuttered-roost')),
        jsonb_build_object('id', 'crows-den-bell-rope-piper', 'section', '30_monsters', 'title', 'Bell-Rope Piper', 'summary', 'A thin piper hidden behind the bar coaxes feathered shapes from floor cracks, using the bell rope as lure and stopping whenever Mother Marrow speaks.', 'tags', jsonb_build_array('bar', 'bell', 'floorboards', 'piper'), 'relatedEntryIds', jsonb_build_array('crows-den-bell-bait-plot', 'crows-den-bell-rope')),
        jsonb_build_object('id', 'crows-den-oubliette-eel', 'section', '30_monsters', 'title', 'Oubliette Eel', 'summary', 'A pale thing circles the well below the cellar, showing a lamprey smile in reflected light and fleeing from crow-bone chimes.', 'tags', jsonb_build_array('well', 'cellar', 'eel', 'chimes'), 'relatedEntryIds', jsonb_build_array('crows-den-oubliette-well', 'crows-den-bone-charm'))
      ),
      '40_places', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-long-table', 'section', '40_places', 'title', 'The Long Table', 'summary', 'A scarred table runs down the taproom with knife marks, old initials, and fresh condensation around seats no visible guest has taken.', 'tags', jsonb_build_array('table', 'names', 'taproom', 'oaths')),
        jsonb_build_object('id', 'crows-den-bell-rope', 'section', '40_places', 'title', 'Bell Rope and Bar', 'summary', 'The bell rope hangs behind the bar within reach of any fool, braided with black hair, gray twine, and one strand that feels like warm wire.', 'tags', jsonb_build_array('bell', 'bar', 'rope', 'warning')),
        jsonb_build_object('id', 'crows-den-rookery-path', 'section', '40_places', 'title', 'Rookery Path', 'summary', 'A rafter route crosses above the room through nests, shutter latches, and old boot boards marked by three-scratch signs.', 'tags', jsonb_build_array('rafters', 'rookery', 'route', 'signs')),
        jsonb_build_object('id', 'crows-den-salt-cellar', 'section', '40_places', 'title', 'Salt Cellar', 'summary', 'Below the stair, salt blooms over casks and stone, muffling sound except for slow taps that answer from behind the lower door.', 'tags', jsonb_build_array('cellar', 'salt', 'casks', 'door')),
        jsonb_build_object('id', 'crows-den-salt-door', 'section', '40_places', 'title', 'The Salt Door', 'summary', 'The lower door is packed with white crystals and crow scratches, opening a finger-width for polite knocks and sweating brine at threats.', 'tags', jsonb_build_array('door', 'salt', 'courtesy', 'brine')),
        jsonb_build_object('id', 'crows-den-backroom-map', 'section', '40_places', 'title', 'Backroom Map Wall', 'summary', 'A hidden wall behind bottle racks carries layered charcoal routes, each corrected by a different hand and none agreeing about the well.', 'tags', jsonb_build_array('map', 'backroom', 'routes', 'well')),
        jsonb_build_object('id', 'crows-den-oubliette-well', 'section', '40_places', 'title', 'Oubliette Well', 'summary', 'A round shaft beneath the cellar returns whispers in the wrong voice and shows ripples even when no one drops a stone.', 'tags', jsonb_build_array('well', 'echoes', 'shaft', 'below')),
        jsonb_build_object('id', 'crows-den-bricked-shrine', 'section', '40_places', 'title', 'Bricked Shrine', 'summary', 'Past a narrow service crawl, soot-dark bricks seal a little shrine where crow bones hang from thread and a cup waits upside down.', 'tags', jsonb_build_array('shrine', 'bricks', 'bones', 'cup')),
        jsonb_build_object('id', 'crows-den-shutter-gallery', 'section', '40_places', 'title', 'Shutter Gallery', 'summary', 'A row of upper shutters opens onto nothing outside, but each frame shows a different angle of the Den when the lantern is turned low.', 'tags', jsonb_build_array('shutters', 'gallery', 'lantern', 'angles')),
        jsonb_build_object('id', 'crows-den-ash-hearth', 'section', '40_places', 'title', 'Ash Hearth', 'summary', 'The cold hearth hides warm ash under its crust and coughs up tiny black beads whenever someone says they are not afraid.', 'tags', jsonb_build_array('hearth', 'ash', 'beads', 'fear'))
      ),
      '50_items', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-salt-key', 'section', '50_items', 'title', 'Salt Key', 'summary', 'A brittle white key leaves clean prints on dirty fingers and fits no visible lock until the holder apologizes to a door.', 'tags', jsonb_build_array('key', 'salt', 'door', 'apology'), 'relatedEntryIds', jsonb_build_array('crows-den-salt-door')),
        jsonb_build_object('id', 'crows-den-rope-knot', 'section', '50_items', 'title', 'Warning Knot', 'summary', 'A thumb-sized knot tied into the bell rope changes shape after each choice, becoming a map, a rebuke, or a small mercy.', 'tags', jsonb_build_array('knot', 'bell', 'warning', 'map'), 'relatedEntryIds', jsonb_build_array('crows-den-rope-boy')),
        jsonb_build_object('id', 'crows-den-tally-ledger', 'section', '50_items', 'title', 'Tally Ledger', 'summary', 'Mother Marrow''s ledger records favors as stains, scratches, and pressed feathers rather than numbers, but she reads it without hesitation.', 'tags', jsonb_build_array('ledger', 'favors', 'feathers', 'marrow'), 'relatedEntryIds', jsonb_build_array('crows-den-mother-marrow')),
        jsonb_build_object('id', 'crows-den-smuggler-map', 'section', '50_items', 'title', 'Underbar Smuggler Map', 'summary', 'A grease-dark map nailed beneath the bar shows exits, false labels, and one route that can only be read in reflected lantern light.', 'tags', jsonb_build_array('map', 'bar', 'routes', 'lantern'), 'relatedEntryIds', jsonb_build_array('crows-den-backroom-map')),
        jsonb_build_object('id', 'crows-den-bone-charm', 'section', '50_items', 'title', 'Crow-Bone Charm', 'summary', 'A charm of hollow bones clicks softly near lies and makes rookery birds pause long enough to reconsider a target.', 'tags', jsonb_build_array('charm', 'bones', 'lies', 'rookery'), 'relatedEntryIds', jsonb_build_array('crows-den-crow-mother-plot')),
        jsonb_build_object('id', 'crows-den-last-lantern', 'section', '50_items', 'title', 'Last Warm Lantern', 'summary', 'A dented lantern burns amber in cold air and steadies frightened hands, but it gutters when carried past an unpaid oath.', 'tags', jsonb_build_array('lantern', 'warmth', 'oath', 'stair'), 'relatedEntryIds', jsonb_build_array('crows-den-lantern-sister')),
        jsonb_build_object('id', 'crows-den-court-token', 'section', '50_items', 'title', 'Black Court Token', 'summary', 'A flat black token bears a beak mark on one side and a blank face on the other, growing heavier when someone avoids a direct answer.', 'tags', jsonb_build_array('token', 'court', 'answer', 'beak'), 'relatedEntryIds', jsonb_build_array('crows-den-carrion-court')),
        jsonb_build_object('id', 'crows-den-ash-beads', 'section', '50_items', 'title', 'Ash Beads', 'summary', 'Tiny beads from the hearth hold a brief image of whoever last warmed their hands nearby, then crumble if handled greedily.', 'tags', jsonb_build_array('ash', 'hearth', 'memory', 'hands'), 'relatedEntryIds', jsonb_build_array('crows-den-ash-hearth'))
      ),
      '60_shops_services', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-marrow-bargains', 'section', '60_shops_services', 'title', 'Mother Marrow''s Bargains', 'summary', 'Mother Marrow offers safe words, route hints, and introductions in exchange for honest intent, carried gossip, or a favor named later.', 'tags', jsonb_build_array('bargain', 'routes', 'gossip', 'favor'), 'relatedEntryIds', jsonb_build_array('crows-den-mother-marrow')),
        jsonb_build_object('id', 'crows-den-lantern-mending', 'section', '60_shops_services', 'title', 'Lantern Mending', 'summary', 'Lantern Sister Pell trims wicks, shares quiet warnings, and steadies anyone willing to speak the name of someone they hope to find.', 'tags', jsonb_build_array('lantern', 'warnings', 'comfort', 'names'), 'relatedEntryIds', jsonb_build_array('crows-den-lantern-sister')),
        jsonb_build_object('id', 'crows-den-roof-guidance', 'section', '60_shops_services', 'title', 'Roof Guidance', 'summary', 'Auntie Caw can point out a safe rafter crossing or a lying shutter if paid with a secret that makes her laugh once.', 'tags', jsonb_build_array('rafters', 'guide', 'secret', 'shutter'), 'relatedEntryIds', jsonb_build_array('crows-den-auntie-caw'))
      ),
      '70_factions', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-carrion-court', 'section', '70_factions', 'title', 'Carrion Court', 'summary', 'The Carrion Court treats the Den as a waiting room where oaths are sorted, contradictions are noticed, and useful guests are marked for later summons.', 'tags', jsonb_build_array('court', 'oaths', 'jurors', 'summons'), 'relatedEntryIds', jsonb_build_array('crows-den-three-mask-clerk', 'crows-den-carrion-juror')),
        jsonb_build_object('id', 'crows-den-rookery-kin', 'section', '70_factions', 'title', 'Rookery Kin', 'summary', 'The roof-dwellers, crows, and feather-shawl guides protect the upper paths, favor clever courtesy, and resent anyone who treats birds as omens only.', 'tags', jsonb_build_array('rookery', 'guides', 'crows', 'courtesy'), 'relatedEntryIds', jsonb_build_array('crows-den-auntie-caw', 'crows-den-crow-mother-plot')),
        jsonb_build_object('id', 'crows-den-salt-route-smugglers', 'section', '70_factions', 'title', 'Salt Route Smugglers', 'summary', 'The underbar and cellar smugglers move messages through brine-stained passages, trusting corrected maps more than spoken directions.', 'tags', jsonb_build_array('smugglers', 'salt', 'maps', 'messages'), 'relatedEntryIds', jsonb_build_array('crows-den-vellum-jack', 'crows-den-smuggler-map')),
        jsonb_build_object('id', 'crows-den-house-memory', 'section', '70_factions', 'title', 'The House Memory', 'summary', 'The Den itself behaves like a faction: doors sulk, tables accuse, and the hearth remembers fear better than friendship.', 'tags', jsonb_build_array('house', 'memory', 'doors', 'hearth'), 'relatedEntryIds', jsonb_build_array('crows-den-bargain-house', 'crows-den-ash-hearth'))
      ),
      '80_encounters', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-bell-bait', 'section', '80_encounters', 'title', 'Bell Bait', 'summary', 'The taproom bell gives one sharp ring, black feathers shake loose from the rafters, and the cellar stair answers with scraping movement below.', 'tags', jsonb_build_array('bell', 'rafters', 'cellar', 'ambush'), 'relatedEntryIds', jsonb_build_array('crows-den-bell-rope', 'crows-den-rafter-crow-wight')),
        jsonb_build_object('id', 'crows-den-shuttered-roost', 'section', '80_encounters', 'title', 'Shuttered Roost', 'summary', 'A shutter slams open above the bar, exposing a narrow rookery path where talons scrape wood and pale eyes track every route out.', 'tags', jsonb_build_array('rookery', 'shutters', 'routes', 'rafters'), 'relatedEntryIds', jsonb_build_array('crows-den-rookery-path', 'crows-den-shutter-rook-swarm')),
        jsonb_build_object('id', 'crows-den-salt-cellar-stir', 'section', '80_encounters', 'title', 'Salt Cellar Stir', 'summary', 'Salt crust cracks across the cellar landing as something pulls itself between stacked casks, turning the stair into a contested passage.', 'tags', jsonb_build_array('cellar', 'salt', 'casks', 'stair'), 'relatedEntryIds', jsonb_build_array('crows-den-salt-cellar', 'crows-den-salt-cask-prowler')),
        jsonb_build_object('id', 'crows-den-carrion-court-summons', 'section', '80_encounters', 'title', 'Carrion Court Summons', 'summary', 'Three crow-marked shapes gather around the long table and tap their beaks in rhythm, daring the room to answer the old tavern oath.', 'tags', jsonb_build_array('table', 'crows', 'oath', 'court'), 'relatedEntryIds', jsonb_build_array('crows-den-long-table', 'crows-den-carrion-juror')),
        jsonb_build_object('id', 'crows-den-backroom-feather-line', 'section', '80_encounters', 'title', 'Backroom Feather Line', 'summary', 'A trail of wet feathers leads behind the shuttered back room, where the floorboards flex from below and each lantern leans toward one seam.', 'tags', jsonb_build_array('feathers', 'backroom', 'floorboards', 'seam'), 'relatedEntryIds', jsonb_build_array('crows-den-backroom-map', 'crows-den-bell-rope-piper')),
        jsonb_build_object('id', 'crows-den-ledger-argument', 'section', '80_encounters', 'title', 'Ledger Argument', 'summary', 'Mother Marrow opens her ledger to a page that names someone present by description, and every route waits for the group''s response.', 'tags', jsonb_build_array('ledger', 'marrow', 'choice', 'routes'), 'relatedEntryIds', jsonb_build_array('crows-den-mother-marrow', 'crows-den-tally-ledger')),
        jsonb_build_object('id', 'crows-den-map-rewrites-itself', 'section', '80_encounters', 'title', 'Map Rewrites Itself', 'summary', 'The underbar map changes while no hand touches it, moving the safe passage through a place the group has already disturbed.', 'tags', jsonb_build_array('map', 'bar', 'routes', 'disturbance'), 'relatedEntryIds', jsonb_build_array('crows-den-smuggler-map', 'crows-den-vellum-jack')),
        jsonb_build_object('id', 'crows-den-salt-door-bargain', 'section', '80_encounters', 'title', 'Salt Door Bargain', 'summary', 'The lower door opens a white-crusted mouth of a crack and demands courtesy through knocking echoes, warm lantern light, or a returned token.', 'tags', jsonb_build_array('door', 'salt', 'bargain', 'lantern'), 'relatedEntryIds', jsonb_build_array('crows-den-salt-door', 'crows-den-salt-key')),
        jsonb_build_object('id', 'crows-den-quiet-bride-toast', 'section', '80_encounters', 'title', 'Quiet Bride Toast', 'summary', 'The veiled figure raises an empty glass; names under the long table brighten, and someone must choose whether to toast, question, or leave.', 'tags', jsonb_build_array('bride', 'glass', 'names', 'choice'), 'relatedEntryIds', jsonb_build_array('crows-den-quiet-bride', 'crows-den-long-table')),
        jsonb_build_object('id', 'crows-den-oubliette-ripple', 'section', '80_encounters', 'title', 'Oubliette Ripple', 'summary', 'A ripple climbs the well wall instead of crossing the water, carrying a reflected smile and the sound of crow-bone chimes.', 'tags', jsonb_build_array('well', 'ripple', 'chimes', 'below'), 'relatedEntryIds', jsonb_build_array('crows-den-oubliette-well', 'crows-den-oubliette-eel')),
        jsonb_build_object('id', 'crows-den-hearth-beads', 'section', '80_encounters', 'title', 'Hearth Beads', 'summary', 'The ash hearth coughs black beads across the floor, each one showing a tiny scene from a route the group has not taken yet.', 'tags', jsonb_build_array('hearth', 'ash', 'vision', 'routes'), 'relatedEntryIds', jsonb_build_array('crows-den-ash-hearth', 'crows-den-ash-beads')),
        jsonb_build_object('id', 'crows-den-rope-boy-warning', 'section', '80_encounters', 'title', 'Rope Boy Warning', 'summary', 'The Rope Boy leaves a new knot in the bell rope and vanishes as the Den rearranges chairs to point toward the next hard choice.', 'tags', jsonb_build_array('rope', 'warning', 'chairs', 'choice'), 'relatedEntryIds', jsonb_build_array('crows-den-rope-boy', 'crows-den-rope-knot'))
      ),
      '90_rules_guidance', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-guidance-concrete-anchors', 'section', '90_rules_guidance', 'title', 'Use Den Anchors', 'summary', 'Frame each beat around a named fixture such as the bell rope, long table, rookery path, salt door, underbar map, or ash hearth.', 'tags', jsonb_build_array('tone', 'anchors', 'fixtures', 'pacing')),
        jsonb_build_object('id', 'crows-den-guidance-choice-first', 'section', '90_rules_guidance', 'title', 'Choice Before Atmosphere', 'summary', 'Move quickly from mood into a route, cost, question, warning, or visible change that gives characters something concrete to answer.', 'tags', jsonb_build_array('pacing', 'choice', 'routes', 'cost')),
        jsonb_build_object('id', 'crows-den-guidance-courtly-menace', 'section', '90_rules_guidance', 'title', 'Courtly Menace', 'summary', 'Let danger sound polite, ritualized, and hungry; the Den threatens through manners, debts, bird signs, and doors that listen.', 'tags', jsonb_build_array('tone', 'court', 'menace', 'manners')),
        jsonb_build_object('id', 'crows-den-guidance-public-safe', 'section', '90_rules_guidance', 'title', 'Public-Safe Mystery', 'summary', 'Reveal clues, routes, omens, and consequences in-world; keep hidden causes implied through sensory signs rather than exposing backstage instructions.', 'tags', jsonb_build_array('mystery', 'clues', 'omens', 'safe')),
        jsonb_build_object('id', 'crows-den-guidance-escalate-through-space', 'section', '90_rules_guidance', 'title', 'Escalate Through Space', 'summary', 'When pressure rises, change the room: shutters open, salt cracks, chairs turn, lanterns gutter, maps shift, or the well answers back.', 'tags', jsonb_build_array('escalation', 'space', 'movement', 'signs'))
      )
    )
  )
)
where id = '11';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.locations'::regclass
      AND tgname = 'update_locations_updated_at'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.locations ENABLE TRIGGER update_locations_updated_at;
  END IF;
END $$;

commit;

notify pgrst, 'reload schema';
