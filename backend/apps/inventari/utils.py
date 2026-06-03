def get_mag_ids(request):
    """
    Retorna una llista de magatzem_ids per filtrar, o None (veu tot):
    - mosso/superior → [el seu magatzem_id] (obligatori)
    - admin + ?magatzem_filter=A&magatzem_filter=B → [A, B] (opcional, multi)
    - admin sense filtre → None (veu tot)
    """
    perfil = getattr(request.user, 'perfil', None)
    if not perfil:
        return None
    if perfil.rol == 'admin':
        ids = request.query_params.getlist('magatzem_filter')
        return ids or None
    if perfil.rol in ('superior', 'mosso') and perfil.magatzem_id:
        return [str(perfil.magatzem_id)]
    return None
