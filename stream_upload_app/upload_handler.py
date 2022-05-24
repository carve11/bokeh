import tornado.web
from tornado.httputil import HTTPHeaders, _parse_header
from tornado.log import gen_log, app_log
from tornado import iostream
import traceback
import json
import os
from time import time
import uuid


MB = 1024 * 1024
GB = 1024 * MB
MAX_STREAMED_SIZE = 20 * GB
SEPARATOR = b'\r\n\r\n'

UPLOAD_FOLDER = 'data/upload/'


class HeaderException(Exception):
    pass


def parser_header_boundary(headers):
    '''
    Parse header to make sure it is correct content.
    Parse boundary and return if present.
    '''
    boundary = None

    if 'Content-Length' not in headers:
        raise HeaderException('Content-Length not present in header')

    content_len = int(headers.get('Content-Length'))

    if content_len > MAX_STREAMED_SIZE:
        raise HeaderException('Too big file')

    if 'Content-Type' not in headers:
        raise HeaderException('Content-Type header not present')

    content_type = headers.get('Content-Type')

    if not content_type.startswith('multipart/form-data'):
        raise HeaderException('Content-Type is not multipart/form-data')

    fields = content_type.split(';')
    for field in fields:
        k, sep, v = field.strip().partition('=')
        if k == 'boundary' and v:
            boundary = v

    if boundary is None:
        raise HeaderException('boundary not found')

    if boundary.startswith('"') and boundary.endswith('"'):
        boundary = boundary[1:-1]

    return boundary


def parse_filename(headers):
    headers_decoded = HTTPHeaders.parse(headers.decode("utf-8"))
    content_disp = headers_decoded.get("Content-Disposition", "")
    disp_keys, disp_params = _parse_header(content_disp)

    return disp_params['filename']


@tornado.web.stream_request_body
class UploadHandler(tornado.web.RequestHandler):
    def initialize(self):
        self.file_size = 0
        self.data = b''
        self.parse_sec = 'header'
        self.fobj = None

        self.upload_path = os.path.join(os.path.dirname(__file__), UPLOAD_FOLDER)
        if not os.path.exists(self.upload_path):
            os.makedirs(self.upload_path)

    def prepare(self):
        self.request.connection.set_max_body_size(MAX_STREAMED_SIZE)

        try:
            boundary = parser_header_boundary(self.request.headers)
        except Exception as e:
            raise

        self.content_len = int(self.request.headers.get('Content-Length'))
        self.bytes_left = self.content_len

        self._boundary_start = "--{}\r\n".format(boundary).encode()
        self._boundary_end = "\r\n--{}--\r\n".format(boundary).encode()


    def data_received(self, chunk):
        '''Chunks received are raw, hence includes boundary and header.
        Need to parse this and only include data when saving to file obj
        '''
        if len(self.data) == 0:
            self.data = chunk
        else:
            self.data += chunk

        self.bytes_left -= len(chunk)

        if self.parse_sec == 'header':
            if self.data.startswith(self._boundary_start):
                self.data = self.data[len(self._boundary_start):]

            if SEPARATOR in self.data:
                headers, remaining_part = self.data.split(SEPARATOR, 1)

                if headers:
                    self.filename = parse_filename(headers)

                    # calculate file_size based on boundarys, header size 
                    # and separator 
                    self.file_size = self.content_len
                    self.file_size -= len(self._boundary_start)
                    self.file_size -= len(self._boundary_end)
                    self.file_size -= len(headers)
                    self.file_size -= len(SEPARATOR)

                    self.data = remaining_part
                    self.parse_sec = 'body'
                else:
                    # need another chunk to parse header
                    return
            else:
                # need another chunk to parse header
                return

        if self.parse_sec == 'body':
            if self.fobj is None:
                self.fname = str(uuid.uuid4())
                self.fname = os.path.join(self.upload_path, self.fname)
                self.fobj = open(self.fname, 'wb')
            
            if self.data.endswith(self._boundary_end):
                self.fobj.write(self.data.split(self._boundary_end)[0])
                return

            elif self.bytes_left > len(self._boundary_end):
                self.fobj.write(self.data)
                self.data = b''
                return

            else:
                self.fobj.write(self.data[:-(len(self._boundary_end)-self.bytes_left)])
                self.data = self.data[-(len(self._boundary_end)-self.bytes_left):]
                

    def post(self):
        self.fobj.close()
        
        if os.path.getsize(self.fname) != self.file_size:
            txt = 'Upload finish but size mismatch!'
            data = {'error': txt}
        else:
            data = {'filename': self.fname}

        self.write(json.dumps(data))


    def write_error(self, status_code, **kwargs):
        '''Override Tornados function in order to provide custom error 
        if exception is from custom exception (no need to write out trace
        back if custom exception)
        '''
        print('in write_error')
        if self.fobj is not None:
            if not self.fobj.closed:
                self.fobj.close()

        if "exc_info" in kwargs:
            if isinstance(kwargs['exc_info'][1], HeaderException):
                self.set_status(400)
                self.write(json.dumps({'error': str(kwargs['exc_info'][1])}))
                self.finish()

        elif self.settings.get("serve_traceback") and "exc_info" in kwargs:
            # in debug mode, try to send a traceback
            self.set_header("Content-Type", "text/plain")
            for line in traceback.format_exception(*kwargs["exc_info"]):
                self.write(line)
            self.finish()
            
        else:
            self.finish(
                "<html><title>%(code)d: %(message)s</title>"
                "<body>%(code)d: %(message)s</body></html>"
                % {"code": status_code, "message": self._reason}
            )

    def log_exception(self, typ,value, tb):
        '''Override to customize logging of uncaught exceptions.
        Updated to just output error msg for the custom exception
        instead of traceback.
        '''
        if isinstance(value, HeaderException):
            app_log.error(value)
        elif isinstance(value, tornado.web.HTTPError):
            if value.log_message:
                format = "%d %s: " + value.log_message
                args = [value.status_code, self._request_summary()] + list(value.args)
                gen_log.warning(format, *args)
        else:
            app_log.error(
                "Uncaught exception %s\n%r",
                self._request_summary(),
                self.request,
                exc_info=(typ, value, tb),  # type: ignore
            )

    def on_connection_close(self):
        '''Override Tornados default setup in order to make sure file obj is
        properly closed in case of anything happening during data_received
        '''
        print('in on_connection_close')
        if self.fobj is not None:
            if not self.fobj.closed:
                self.fobj.close()

        if not self.request._body_future.done():
            self.request._body_future.set_exception(iostream.StreamClosedError())
            self.request._body_future.exception()