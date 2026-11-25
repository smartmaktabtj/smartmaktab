"""Use inert payload attributes so embedded source cannot be mistaken for markup."""
from base64 import b64encode

def encoded(value):
    return b64encode(value.encode('utf8')).decode('ascii')

def inline_script(value):
    code=encoded(value)
    return (f'<template id="sm-inline-source" data-code="{code}"></template>'
        '<script>(function(){var n=document.getElementById("sm-inline-source");'
        'var s=document.createElement("script");s.textContent=new TextDecoder().decode('
        'Uint8Array.from(atob(n.dataset.code),function(c){return c.charCodeAt(0);}));'
        'document.body.appendChild(s);})();</script>')
