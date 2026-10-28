from django import forms
from core.models import NetworkCode, Profile


class LoginForm(forms.Form):
    email = forms.EmailField(
        label='Email Address',
        widget=forms.EmailInput(attrs={
            'placeholder': 'name@thewoddi.org',
            'autocomplete': 'username',
            'autofocus': True,
        })
    )
    password = forms.CharField(
        label='Password',
        widget=forms.PasswordInput(attrs={
            'placeholder': '••••••••',
            'autocomplete': 'current-password',
        })
    )
    remember = forms.BooleanField(
        label='Remember me on this device',
        required=False,
        initial=True
    )


class RegisterForm(forms.Form):
    network = forms.ChoiceField(
        label='Network Membership',
        choices=[
            (NetworkCode.WGMN, 'Good Mother Network (WGMN · 30+)'),
            (NetworkCode.WNNN, 'Next-Gen Nurturers Network (WNNN · 18–29)'),
        ],
        widget=forms.Select(attrs={'class': 'input'})
    )
    first_name = forms.CharField(
        label='First Name',
        max_length=60,
        widget=forms.TextInput(attrs={'placeholder': 'e.g. Amina', 'autocomplete': 'given-name'})
    )
    last_name = forms.CharField(
        label='Last Name / Surname',
        max_length=60,
        widget=forms.TextInput(attrs={'placeholder': 'e.g. Adeleke', 'autocomplete': 'family-name'})
    )
    email = forms.EmailField(
        label='Email Address',
        widget=forms.EmailInput(attrs={'placeholder': 'you@example.com', 'autocomplete': 'email'})
    )
    phone = forms.CharField(
        label='Phone Number (WhatsApp)',
        max_length=40,
        required=False,
        widget=forms.TextInput(attrs={'placeholder': '+234 800 000 0000', 'autocomplete': 'tel'})
    )
    password = forms.CharField(
        label='Create Password',
        min_length=8,
        widget=forms.PasswordInput(attrs={'placeholder': 'At least 8 characters', 'autocomplete': 'new-password'}),
        help_text='Use at least 8 characters for your account security.'
    )
    confirm_password = forms.CharField(
        label='Confirm Password',
        min_length=8,
        widget=forms.PasswordInput(attrs={'placeholder': 'Repeat your password', 'autocomplete': 'new-password'})
    )

    def clean_email(self):
        email = self.cleaned_data.get('email', '').strip().lower()
        if Profile.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError('An account with this email address already exists. Please sign in.')
        return email

    def clean(self):
        cleaned_data = super().clean()
        pw = cleaned_data.get('password')
        cpw = cleaned_data.get('confirm_password')
        if pw and cpw and pw != cpw:
            self.add_error('confirm_password', 'Passwords do not match. Please verify and re-enter.')
        return cleaned_data


class VerifyCodeForm(forms.Form):
    code = forms.CharField(
        label='6-Digit Verification Code',
        max_length=6,
        min_length=6,
        widget=forms.TextInput(attrs={
            'placeholder': '123456',
            'maxlength': '6',
            'autocomplete': 'one-time-code',
            'autofocus': True,
            'style': 'font-family:monospace; font-size:22px; letter-spacing:4px; text-align:center;',
        }),
        help_text='Enter the 6-digit confirmation code shown or sent to your email.'
    )


class RecoverForm(forms.Form):
    email = forms.EmailField(
        label='Registered Email Address',
        widget=forms.EmailInput(attrs={
            'placeholder': 'name@thewoddi.org',
            'autocomplete': 'email',
            'autofocus': True,
        }),
        help_text='Enter your registered email address and we will provide a recovery link.'
    )


class ResetPasswordForm(forms.Form):
    new_password = forms.CharField(
        label='New Password',
        min_length=8,
        widget=forms.PasswordInput(attrs={'placeholder': 'At least 8 characters', 'autocomplete': 'new-password'}),
        help_text='Use at least 8 characters with letters and numbers.'
    )
    confirm_password = forms.CharField(
        label='Confirm New Password',
        min_length=8,
        widget=forms.PasswordInput(attrs={'placeholder': 'Repeat your new password', 'autocomplete': 'new-password'})
    )

    def clean(self):
        cleaned_data = super().clean()
        pw = cleaned_data.get('new_password')
        cpw = cleaned_data.get('confirm_password')
        if pw and cpw and pw != cpw:
            self.add_error('confirm_password', 'Passwords do not match.')
        return cleaned_data


class MfaForm(forms.Form):
    code = forms.CharField(
        label='Authenticator Security Code',
        max_length=6,
        min_length=6,
        widget=forms.TextInput(attrs={
            'placeholder': '123456',
            'maxlength': '6',
            'autocomplete': 'one-time-code',
            'autofocus': True,
            'style': 'font-family:monospace; font-size:22px; letter-spacing:4px; text-align:center;',
        })
    )
