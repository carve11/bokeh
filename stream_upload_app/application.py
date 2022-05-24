from bokeh.application import Application
from bokeh.application.handlers import FunctionHandler
import tornado.web
from bokeh.server.server import Server
from tornado import version as tornado_version
from bokeh import __version__ as bokeh_version
import os
from functools import partial
from upload_handler import UploadHandler
from bkapp import make_doc


PORT = 5006
UPLOAD_ENDPOINT = '/upload'


def create_bokeh_server():
    os.environ['BOKEH_RESOURCES'] = 'cdn'
    app_path = os.path.normpath(os.path.dirname(__file__))
    app_name = os.path.basename(app_path)

    url_path = '/' + app_name
    upload_url = url_path + UPLOAD_ENDPOINT

    handler = FunctionHandler(partial(make_doc, upload_url = upload_url))
    bkapp = Application(handler)

    server = Server( 
        {url_path: bkapp},
        port = PORT,
        extra_patterns = [
            (
                upload_url,
                UploadHandler, 
            ),
            (
                r'/static/js/(.*)',
                tornado.web.StaticFileHandler,
                {'path': os.path.join(app_path, 'static/js')}
            )
        ]
    )

    address_string = 'localhost'
    if server.address is not None and server.address != '':
        address_string = server.address

    url = 'http://%s:%d%s%s' % (address_string, server.port, server.prefix, url_path)

    print('Starting Bokeh server version %s (running on Tornado %s)' % (bokeh_version, tornado_version))
    print('Starting Bokeh server with process id: %d' % os.getpid())
    print('Bokeh app running at: %s' % url)

    return server
