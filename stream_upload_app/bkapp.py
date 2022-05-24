from bokeh.models import Div, ColumnDataSource
from bokeh.plotting import figure
from bokeh.layouts import column
from jinja2 import Environment, FileSystemLoader
import os
import json
import pandas as pd


UPLOAD_HTML = '''
<input type="file" name="file_wdg" id="fileWdgId" accept=".csv">
<br>
<input type="submit" id="submit_file_wdg" onclick="uploadWdg('/UPLOAD_ENDPOINT')">
'''

class BkApp(object):
    def __init__(self, doc, upload_url):
        self.doc = doc
        self.upload_url = upload_url

        self.src = ColumnDataSource(data = {'x': [], 'y': []})

        layout = self.layout()

        self.doc.add_root(layout)
        

    def layout(self):
        self.div_wdg = upload_div(self.upload_url)
        
        # Div used to capture filename of uploaded file to server
        # The div is hidden since we just use it to pass information
        # from upload endpoint to Bokeh app
        self.uploadMetaData = Div(text = '', name = 'uploadMetaData', visible = False)
        self.uploadMetaData.on_change('text', self.cb_uploadMetaData)

        self.p = figure()
        self.p.circle(
            x = 'x', y = 'y', size = 15, 
            fill_alpha = 0.5, source = self.src
            )
        self.p.visible = False

        return column(self.div_wdg, self.uploadMetaData, self.p)


    def cb_uploadMetaData(self, attr, old, new):
        # the Div text attribute is updated with `new`
        # hence one can read the contents of the file uploaded
        # through `filename` key 
        response = json.loads(new)

        if 'filename' in response:
            data = pd.read_csv(response['filename'])
            self.src.data = data
            self.p.visible = True


def upload_div(upload_url):
    return Div(text = UPLOAD_HTML.replace('/UPLOAD_ENDPOINT', upload_url))


def make_doc(doc, upload_url):
    # add custom index to document
    appindex = os.path.join('.', 'templates', 'index.html')
    env = Environment(loader=FileSystemLoader(os.path.dirname(appindex)))
    doc.template = env.get_template('index.html')
    doc.title = 'Upload app'

    BkApp(doc, upload_url)
