from django import forms

from operations.models import Meeting


class MeetingForm(forms.ModelForm):
    starts_at = forms.DateTimeField(
        widget=forms.DateTimeInput(attrs={'type': 'datetime-local'}, format='%Y-%m-%dT%H:%M'),
        input_formats=['%Y-%m-%dT%H:%M'],
    )
    ends_at = forms.DateTimeField(
        widget=forms.DateTimeInput(attrs={'type': 'datetime-local'}, format='%Y-%m-%dT%H:%M'),
        input_formats=['%Y-%m-%dT%H:%M'],
    )

    class Meta:
        model = Meeting
        fields = [
            'title', 'agenda', 'org_unit', 'mode', 'platform', 'location',
            'audience', 'access', 'guest_auto_admit', 'starts_at', 'ends_at',
        ]
        labels = {
            'location': 'Link or place',
            'access': 'Who can join',
            'guest_auto_admit': 'Direct guest entry (no waiting room)',
        }

    def __init__(self, *a, units=None, **kw):
        super().__init__(*a, **kw)
        self._units = units
        if units is not None:
            self.fields['org_unit'].queryset = units
        self.fields['title'].min_length = 3
        self.fields['access'].required = False
        self.fields['org_unit'].required = False
        self.fields['audience'].required = False
        if 'platform' in self.fields:
            self.fields['platform'].choices = [('woddi', 'WODDI Room')]
            self.fields['platform'].initial = 'woddi'

    def clean(self):
        d = super().clean()
        s, e = d.get('starts_at'), d.get('ends_at')
        if s and e and e <= s:
            self.add_error('ends_at', 'The meeting must end after it starts.')
        if not d.get('access'):
            d['access'] = 'members'
        if not d.get('platform'):
            d['platform'] = 'woddi'
        if not d.get('org_unit') and self._units is not None:
            d['org_unit'] = self._units.first()
        if not d.get('org_unit'):
            self.add_error('org_unit', 'Please select a host organisational unit.')
        if d.get('access') == 'anyone':
            d['audience'] = 'all'
        elif not d.get('audience'):
            d['audience'] = 'unit'
        return d
