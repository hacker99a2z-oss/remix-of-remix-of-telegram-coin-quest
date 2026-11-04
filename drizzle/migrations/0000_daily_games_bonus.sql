ALTER TABLE public.players ADD COLUMN IF NOT EXISTS daily_games integer NOT NULL DEFAULT 0;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS daily_games_date date;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS bonus_claimed_date date;

CREATE OR REPLACE FUNCTION public.finish_game(p_tg_id bigint, p_score integer, p_reward integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.players; s int := public.current_season(); today date := (now() at time zone 'utc')::date;
BEGIN
  SELECT * INTO p FROM public.players WHERE tg_id = p_tg_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player not found'; END IF;
  IF p.last_play_date IS DISTINCT FROM today THEN
    UPDATE public.players SET last_play_date = today WHERE tg_id = p_tg_id;
  ELSIF p.extra_plays > 0 THEN
    UPDATE public.players SET extra_plays = extra_plays - 1 WHERE tg_id = p_tg_id;
  ELSE
    RAISE EXCEPTION 'no plays left';
  END IF;
  UPDATE public.players SET
    coins = coins + p_reward,
    season_coins = CASE WHEN season_id = s THEN season_coins + p_reward ELSE p_reward END,
    season_id = s,
    games_played = games_played + 1,
    best_score = greatest(best_score, p_score),
    daily_games = CASE WHEN daily_games_date = today THEN daily_games + 1 ELSE 1 END,
    daily_games_date = today
  WHERE tg_id = p_tg_id;
  IF p.referred_by IS NOT NULL AND NOT p.referral_paid AND p.games_played + 1 >= 10 THEN
    UPDATE public.players SET referral_paid = true WHERE tg_id = p_tg_id;
    UPDATE public.players SET
      coins = coins + 100,
      season_coins = CASE WHEN season_id = s THEN season_coins + 100 ELSE 100 END,
      season_id = s,
      referral_count = referral_count + 1
    WHERE tg_id = p.referred_by;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.claim_daily_bonus(p_tg_id bigint, p_goal integer, p_coins bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE today date := (now() at time zone 'utc')::date;
BEGIN
  UPDATE public.players SET coins = coins + p_coins, bonus_claimed_date = today
  WHERE tg_id = p_tg_id AND daily_games_date = today AND daily_games >= p_goal
    AND bonus_claimed_date IS DISTINCT FROM today;
  IF NOT FOUND THEN RAISE EXCEPTION 'bonus not available'; END IF;
  RETURN true;
END $function$;

REVOKE ALL ON FUNCTION public.claim_daily_bonus(bigint, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus(bigint, integer, bigint) TO service_role;