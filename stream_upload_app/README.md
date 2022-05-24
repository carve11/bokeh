# Streaming upload file app

Example of a Bokeh app for uploading large files through streaming the file to the server. The regular Bokeh `FileInput` widget stores file in browser memory and there is limits to how large a file the browser can handle.

The app creates a `Tornado` upload endpoint and programically starts the Bokeh server. A JS activates the `POST` method. In the Bokeh document a `Div` widget is used for getting the file name of the uploaded file, which then can be read and processed.

The app is started in the folder:

    python3 main.py