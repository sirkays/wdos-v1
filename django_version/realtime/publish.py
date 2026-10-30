import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

logger = logging.getLogger(__name__)


def _push_now(group: str, event: dict) -> None:
    try:
        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            group,
            {
                'type': 'wdos.event',
                'payload': event,
            },
        )
    except Exception as exc:
        logger.warning('Realtime publish failed for group=%s: %s', group, exc)


def send(group: str, event: dict, *, immediate: bool = False) -> None:
    """Publish an event to a Channels group after the current database transaction commits."""
    if immediate:
        _push_now(group, event)
        return
    try:
        transaction.on_commit(lambda: _push_now(group, event))
    except Exception as exc:
        logger.warning('Realtime on_commit schedule failed for group=%s: %s', group, exc)
