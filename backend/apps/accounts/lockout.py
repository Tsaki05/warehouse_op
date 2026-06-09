import json
from django.http import HttpResponse


def json_lockout(request, original_response, credentials, *args, **kwargs):
    body = json.dumps({'detail': 'Massa intents fallits. Torna-ho a intentar en un minut.'})
    return HttpResponse(body, content_type='application/json', status=429)
