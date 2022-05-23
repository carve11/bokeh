from bokeh.plotting import figure, output_file, save
from bokeh.layouts import row, column
from bokeh.models import ColumnDataSource
from bokeh.transform import linear_cmap
from bokeh.palettes import YlOrRd3
from bokeh.tile_providers import CARTODBPOSITRON, get_provider
from scalebar import ScaleBar
import numpy as np


output_file('scalebar.html', title='Annotation extension')

IMG_URL = 'https://upload.wikimedia.org/wikipedia/commons/d/d6/Cellular_Uptake_NPs.jpg'
LOCATION = ['top_left', 'top_right', 'bottom_right']

'''
Example of scale bar on map tile - scale_type as bar

4 scales on the map to show use of location argument.
One scale using imperial units, the rest the default metric.
Scale bar updated when zoom is applied.
'''
tile_provider = get_provider(CARTODBPOSITRON)

# range bounds supplied in web mercator coordinates
p_map = figure(
    x_range = (-2000000, 6000000), y_range = (-1000000, 7000000),
    x_axis_type = 'mercator', y_axis_type = 'mercator'
    )
p_map.yaxis.axis_label = 'Latitude'
p_map.xaxis.axis_label = 'Longitude'
p_map.axis.axis_label_text_font_style = 'normal'

p_map.add_tile(tile_provider)
bar_map_imp = ScaleBar(
    px_size = 'mercator', system_of_measure = 'imperial'
    )
p_map.add_layout(bar_map_imp)

for l in LOCATION:
    bar_map_l = ScaleBar(location = l, px_size = 'mercator')
    p_map.add_layout(bar_map_l)


'''
Example with image and specified `px_size` value - scale_type as line

Here the figure ranges and image_url w/h do not reflect image
dimensions 1:1, hence px_size for the scale is based on the specified
width. Have kept axis tick labels for information (hence the canvas
w/h ratio is not 100% accurate compared to image w/h ratio).

Added one scale that uses scientific notation
Scale bar updated when zoom is applied.
'''
img_w = 1536
img_h = 1103
toolbar_w = 30
plot_w = 600
plot_h = int((plot_w-toolbar_w) * (img_h/img_w))
px_size = 25.9/10 # um/px

p_img = figure(
    plot_height = plot_h, plot_width = plot_w,
    x_range = (0, 10), y_range = (10, 0))
p_img.image_url(url = [IMG_URL], x = 0, y = 0, w = 10, h = 10)
bar_img = ScaleBar(
    location = 'top_left', px_size = px_size, unit = 'um',
    scale_type = 'line', y_offset = 1
    )
p_img.add_layout(bar_img)

# use of scientific notation
bar_img = ScaleBar(
    location = 'top_right', px_size = px_size/1e6, unit = 'm',
    scale_type = 'line', y_offset = 1, system_of_measure = 'scientific'
    )
p_img.add_layout(bar_img)

'''
Example using px_size='auto'

Using circle glyph with radius specified, hence data units.
The scale bar could in this case relate to the size of the circles.
Scale bar updated when zoom is applied.
'''
# Random data
x = np.random.random(20) * 20
y = np.random.random(20) * 20
radius = np.random.random(20) + 0.1
src = ColumnDataSource({'x': x, 'y': y, 'radius': radius})

mapper = linear_cmap(
    field_name = 'radius', palette = YlOrRd3,
    low = min(radius), high = max(radius)
    )

p_auto = figure(plot_width = 500, plot_height = 400)
p_auto.circle(
    x = 'x', y = 'y', radius = 'radius',
    fill_alpha = 0.5, fill_color = mapper, 
    source = src
    )

bar = ScaleBar(
    px_size = 'auto', scale_type = 'line', length = 100,
    unit = 'mm', y_offset = 1, fill_alpha = 0.5
    )
p_auto.add_layout(bar)

# save plot objects to file
col1 = column(p_map, p_img, margin = (0, 20, 0, 0))
col2 = column(p_auto)
save(row(col1, col2))

