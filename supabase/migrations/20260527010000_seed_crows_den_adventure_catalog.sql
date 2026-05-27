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
  coalesce(metadata -> 'adventureCatalog', '{}'::jsonb) || jsonb_build_object(
    'defaults',
    coalesce(metadata #> '{adventureCatalog,defaults}', '{}'::jsonb) || jsonb_build_object(
      'arcSummary', 'The Crow''s Den is a shuttered taproom where a baited bell, rookery rafters, and a cellar stair keep offering the characters dangerous routes forward.',
      'currentStakes', 'The characters must decide whether to control the bell, test the cellar stair, or risk the rafters before the tavern chooses a path for them.',
      'openingDecision', jsonb_build_object(
        'id', 'crows-den-opening-choice',
        'prompt', 'Which Crow''s Den hook does the group answer first?',
        'options', jsonb_build_array(
          jsonb_build_object('id', 'control-bell', 'label', 'Quiet the bell rope'),
          jsonb_build_object('id', 'test-cellar', 'label', 'Take the cellar stair'),
          jsonb_build_object('id', 'watch-rafters', 'label', 'Study the rookery rafters')
        )
      ),
      'discoveries', jsonb_build_array(
        'The bell rope moves even when the taproom air is still.',
        'Black feathers collect near the cellar stair instead of the rafters.'
      ),
      'clocks', jsonb_build_array(
        jsonb_build_object(
          'id', 'crows-den-rafters',
          'label', 'Rafter Attention',
          'value', 0,
          'max', 6,
          'summary', 'Signs in the rafters become harder to ignore.'
        )
      )
    ),
    'sections',
    coalesce(metadata #> '{adventureCatalog,sections}', '{}'::jsonb) || jsonb_build_object(
      '80_encounters', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-bell-bait', 'section', '80_encounters', 'title', 'Bell Bait', 'summary', 'The taproom bell gives one sharp ring, and black feathers shake loose from the rafters while the cellar stair answers with scraping movement.', 'tags', jsonb_build_array('bell', 'rafters', 'cellar', 'ambush')),
        jsonb_build_object('id', 'crows-den-shuttered-roost', 'section', '80_encounters', 'title', 'Shuttered Roost', 'summary', 'A shutter slams open above the bar, exposing a narrow rookery path where talons scrape wood and pale eyes track every route out.', 'tags', jsonb_build_array('rookery', 'shutters', 'routes', 'rafters')),
        jsonb_build_object('id', 'crows-den-salt-cellar-stir', 'section', '80_encounters', 'title', 'Salt Cellar Stir', 'summary', 'Salt crust cracks across the cellar landing as something pulls itself between stacked casks, turning the stair into a contested choke point.', 'tags', jsonb_build_array('cellar', 'salt', 'casks', 'stair')),
        jsonb_build_object('id', 'crows-den-carrion-court', 'section', '80_encounters', 'title', 'Carrion Court Summons', 'summary', 'Three crow-marked shapes gather around the long table and tap their beaks in rhythm, daring the room to answer the old tavern oath.', 'tags', jsonb_build_array('table', 'crows', 'oath', 'social')),
        jsonb_build_object('id', 'crows-den-feather-line', 'section', '80_encounters', 'title', 'Backroom Feather Line', 'summary', 'A trail of wet feathers leads behind the shuttered back room, where the floorboards flex from below and every lantern leans toward the same seam.', 'tags', jsonb_build_array('feathers', 'backroom', 'floorboards', 'seam'))
      ),
      '30_monsters', jsonb_build_array(
        jsonb_build_object('id', 'crows-den-rafter-crow-wight', 'section', '30_monsters', 'title', 'Rafter Crow-Wight', 'summary', 'An ash-black crow-wight folds itself among the beams, speaking in borrowed tavern whispers before dropping toward anyone near the bell rope.', 'tags', jsonb_build_array('crow', 'rafters', 'bell', 'wight')),
        jsonb_build_object('id', 'crows-den-salt-cask-prowler', 'section', '30_monsters', 'title', 'Salt-Cask Prowler', 'summary', 'A salt-caked cellar prowler drags hook-shaped nails across casks and tries to herd intruders toward the lowest stair.', 'tags', jsonb_build_array('cellar', 'salt', 'casks', 'prowler')),
        jsonb_build_object('id', 'crows-den-carrion-juror', 'section', '30_monsters', 'title', 'Carrion Juror', 'summary', 'A masked carrion juror perches at the long table, judging each answer with a beak-click rhythm that turns allies against haste.', 'tags', jsonb_build_array('table', 'carrion', 'social', 'beak')),
        jsonb_build_object('id', 'crows-den-shutter-rook-swarm', 'section', '30_monsters', 'title', 'Shutter Rook-Swarm', 'summary', 'A ragged rook-swarm pours through broken shutters in a single dark sheet, splitting around lantern light and reforming near exits.', 'tags', jsonb_build_array('rookery', 'shutters', 'lanterns', 'exits')),
        jsonb_build_object('id', 'crows-den-bell-rope-piper', 'section', '30_monsters', 'title', 'Bell-Rope Piper', 'summary', 'A thin piper hidden behind the bar coaxes feathered shapes from cracks in the floor, using the bell rope as a lure.', 'tags', jsonb_build_array('bar', 'bell', 'floorboards', 'piper'))
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
