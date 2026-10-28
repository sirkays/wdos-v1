from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('operations', '0004_meeting_access_meeting_guest_auto_admit_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='meeting',
            name='passcode',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
    ]
