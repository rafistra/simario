from django.db import migrations

# INV-6: the audit trail is append-only. Row-level triggers do not fire on TRUNCATE, which the
# dev reset uses.
CREATE = """
CREATE FUNCTION audit_auditlog_reject_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_auditlog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_auditlog_append_only
BEFORE UPDATE OR DELETE ON audit_auditlog
FOR EACH ROW EXECUTE FUNCTION audit_auditlog_reject_change();
"""

DROP = """
DROP TRIGGER IF EXISTS audit_auditlog_append_only ON audit_auditlog;
DROP FUNCTION IF EXISTS audit_auditlog_reject_change();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [migrations.RunSQL(CREATE, DROP)]
