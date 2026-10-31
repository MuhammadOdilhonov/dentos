from django.db import connection
from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .access import COOKIE

def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        return JsonResponse({'status': 'ok'})
    except Exception:
        return JsonResponse({'status': 'unavailable'}, status=503)

@api_view(['POST'])
def logout(request):
    response = Response({'ok': True})
    response.delete_cookie(COOKIE, path='/')
    return response

@api_view(['GET'])
def me(request):
    from .telegram_login import account_payload
    account = getattr(request.user, 'account', None)
    if not account:
        return Response(status=401)
    return Response({'user': account_payload(account)})
