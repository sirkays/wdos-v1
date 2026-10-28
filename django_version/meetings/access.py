"""Who may see, join and manage a meeting (rules from migrations 007 + 052)."""
from django.db.models import Q

from core.models import Profile

ACTIVE = ('approved', 'activated', 'in_training', 'active', 'reinstated')


def descendant_ids(unit):
    from onboarding.views import _descendant_ids
    return _descendant_ids(unit)


def user_unit(user):
    seat = user.roles.filter(ends_at__isnull=True).select_related('org_unit').first()
    return (seat.org_unit if seat else user.org_unit), seat


def reach(user):
    """None = everything (HQ); else the set of unit ids the user leads or belongs to."""
    if user.is_in_hq():
        return None
    unit, seat = user_unit(user)
    if not unit:
        return set()
    return descendant_ids(unit) if seat else {unit.pk}


def is_manager(user, meeting):
    """Organiser, a leader over the unit, or HQ. A plain member of the unit is not a manager."""
    if meeting.organiser_id == user.pk or user.is_in_hq():
        return True
    unit, seat = user_unit(user)
    return bool(seat and unit and meeting.org_unit_id in descendant_ids(unit))


def audience_q(meeting):
    """Profiles invited by the meeting's audience."""
    a = meeting.audience
    live = Q(status__in=ACTIVE)
    if a == 'unit':
        return Q(org_unit_id__in=descendant_ids(meeting.org_unit))
    if a == 'hq':
        return Q(hq_function__isnull=False) & ~Q(hq_function='')
    if a in ('wgmn_ng', 'wgmn_all', 'wnnn_ng', 'wnnn_all'):
        net = a[:4].upper()
        q = live & Q(network=net)
        return q & Q(country__iexact='Nigeria') if a.endswith('_ng') else q
    return live | (Q(hq_function__isnull=False) & ~Q(hq_function=''))


def invitees(meeting):
    return Profile.objects.filter(audience_q(meeting)).exclude(pk=meeting.organiser_id).distinct()


def can_see(user, meeting):
    r = reach(user)
    if r is None or meeting.organiser_id == user.pk or meeting.org_unit_id in r:
        return True
    return invitees(meeting).filter(pk=user.pk).exists()


def visible_meetings(user):
    from operations.models import Meeting
    r = reach(user)
    if r is None:
        return Meeting.objects.all()
    mine = Q(organiser=user) | Q(org_unit_id__in=r)
    ids = [m.pk for m in Meeting.objects.exclude(mine) if invitees(m).filter(pk=user.pk).exists()] \
        if Meeting.objects.exclude(mine).count() < 500 else []
    return Meeting.objects.filter(mine | Q(pk__in=ids)).distinct()
