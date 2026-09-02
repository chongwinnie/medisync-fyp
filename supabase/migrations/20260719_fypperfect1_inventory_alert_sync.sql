-- FYP-PERFECT-1: keep inventory_alerts in sync when stock levels change
-- (adjust / reorder / stock_transactions). Idempotent.

CREATE OR REPLACE FUNCTION sync_inventory_alert_on_stock_change()
RETURNS TRIGGER AS $$
DECLARE
  existing_id UUID;
  sev alert_severity;
  msg TEXT;
BEGIN
  IF NEW.current_stock > NEW.minimum_level THEN
    UPDATE inventory_alerts
    SET is_dismissed = true,
        dismissed_at = COALESCE(dismissed_at, now()),
        updated_at = now()
    WHERE item_id = NEW.id
      AND alert_type = 'low_stock'
      AND is_dismissed = false;
    RETURN NEW;
  END IF;

  sev := CASE
    WHEN NEW.current_stock <= GREATEST(1, NEW.minimum_level / 2) THEN 'critical'::alert_severity
    ELSE 'warning'::alert_severity
  END;
  msg := format('Stock below minimum level (%s/%s)', NEW.current_stock, NEW.minimum_level);

  SELECT id INTO existing_id
  FROM inventory_alerts
  WHERE item_id = NEW.id
    AND alert_type = 'low_stock'
    AND is_dismissed = false
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE inventory_alerts
    SET severity = sev,
        message = msg,
        updated_at = now()
    WHERE id = existing_id;
  ELSE
    INSERT INTO inventory_alerts (item_id, alert_type, severity, message, is_dismissed, triggered_at)
    VALUES (NEW.id, 'low_stock', sev, msg, false, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_inventory_alert_on_stock ON inventory_items;
CREATE TRIGGER trg_sync_inventory_alert_on_stock
AFTER UPDATE OF current_stock, minimum_level ON inventory_items
FOR EACH ROW
WHEN (
  OLD.current_stock IS DISTINCT FROM NEW.current_stock
  OR OLD.minimum_level IS DISTINCT FROM NEW.minimum_level
)
EXECUTE FUNCTION sync_inventory_alert_on_stock_change();
