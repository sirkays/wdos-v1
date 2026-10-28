import json
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Profile, OrgUnit, RoleAssignment, AuditLog


def record_audit(actor, action, table_name, record_id, old_values=None, new_values=None, reason=''):
    try:
        AuditLog.objects.create(
            actor=actor,
            action=action,
            table_name=table_name,
            record_id=str(record_id),
            old_values=old_values or {},
            new_values=new_values or {},
            reason=reason or ''
        )
    except Exception:
        pass


@receiver(post_save, sender=RoleAssignment)
def on_role_assignment_saved(sender, instance, created, **kwargs):
    action = 'APPOINTMENT' if created else 'ROLE_UPDATE'
    record_audit(
        actor=instance.assigned_by,
        action=action,
        table_name='role_assignments',
        record_id=instance.id,
        new_values={'role': instance.role, 'org_unit_id': str(instance.org_unit_id)},
        reason='Leadership role updated'
    )
    # Automatically ensure profile is_leader flag reflects active roles
    has_active_leader_role = RoleAssignment.objects.filter(
        profile=instance.profile,
        ends_at__isnull=True
    ).exclude(role__in=['member', 'applicant', 'donor', 'external_partner']).exists()

    if instance.profile.is_leader != has_active_leader_role:
        instance.profile.is_leader = has_active_leader_role
        instance.profile.save(update_fields=['is_leader'])
