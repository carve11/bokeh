import application

if __name__ == '__main__':
    server = application.create_bokeh_server()
    server.run_until_shutdown()