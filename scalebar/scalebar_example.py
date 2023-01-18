from bokeh.plotting import figure, output_file, save
from bokeh.layouts import row, column
from bokeh.models import ColumnDataSource, Div
from bokeh.transform import linear_cmap
from bokeh.palettes import YlOrRd3
from scalebar import ScaleBar
import numpy as np


output_file('scalebar.html', title='Annotation extension')

IMG_URL = 'https://upload.wikimedia.org/wikipedia/commons/d/d6/Cellular_Uptake_NPs.jpg'
LOCATION = ['top_left', 'top_right', 'bottom_right']
WIDTH = 600

CODE_STYLE = '''
code {
    background-color: #eee;
    border-radius: 3px;
    font-family: courier, monospace;
    padding: 0 3px;
}
'''

def divelement(txt):
    div = Div(text = txt, width = WIDTH)
    div.stylesheets.append(CODE_STYLE)

    return div


map_txt = '''
<h3>Example of scale bar on map tile</h3>
<p>
Scale bar when using <code>scale_type="bar"</code> (default).
One scale using <code>system_of_measure="imperial"</code>,
the others using default <code>metric</code>. Example also shows
use of <code>location</code> argument. Scale updates when zooming.
</p>
'''

# range bounds supplied in web mercator coordinates
p_map = figure(
    x_range = (-2000000, 6000000),
    y_range = (-1000000, 7000000),
    x_axis_type = 'mercator',
    y_axis_type = 'mercator',
    width = WIDTH,
    active_scroll = 'wheel_zoom'
    )

p_map.yaxis.axis_label = 'Latitude'
p_map.xaxis.axis_label = 'Longitude'
p_map.axis.axis_label_text_font_style = 'normal'

p_map.add_tile("CartoDB Positron", retina=True)

bar_map_imp = ScaleBar(
    px_size = 'mercator', system_of_measure = 'imperial'
    )
p_map.add_layout(bar_map_imp)

for l in LOCATION:
    bar_map_l = ScaleBar(location = l, px_size = 'mercator')
    p_map.add_layout(bar_map_l)

layout_map = column(divelement(map_txt), p_map)

#------------------------------------------------------------------------------
img_txt = '''
<h3>Example with image and specified value of <code>px_size</code></h3>
<p>
Here the figure ranges and <code>image_url</code> w/h do not reflect image
dimensions 1:1, hence <code>px_size</code> for the scale is based 
on the specified width. From the SEM image we know HFW = 25.9 μm, and if using
<code>image_url</code> width of 10 then <code>px_size=25.9/10</code>.
Have kept axis tick labels for information. Both scales use 
<code>scale_type = "line"</code>, where the scale to the left uses SI prefix 
while the other uses scientific notation 
(<code>system_of_measure = "scientific"</code>).
Scale updates when zooming.
</p>
'''
img_w = 1536
img_h = 1103
toolbar_w = 30
plot_h = int((WIDTH-toolbar_w) * (img_h/img_w))
px_size = 25.9/10 # um/px

p_img = figure(
    height = plot_h, width = WIDTH,
    x_range = (0, 10), y_range = (10, 0),
    active_scroll = 'wheel_zoom'
    )

p_img.image_url(url = [IMG_URL], x = 0, y = 0, w = 10, h = 10)
bar_img = ScaleBar(
    location = 'top_left', px_size = px_size, unit = 'um',
    scale_type = 'line',
    )
p_img.add_layout(bar_img)

# use of scientific notation
bar_img = ScaleBar(
    location = 'top_right', px_size = px_size/1e6, unit = 'm',
    scale_type = 'line', system_of_measure = 'scientific'
    )
p_img.add_layout(bar_img)
layout_img = column(divelement(img_txt), p_img)

#------------------------------------------------------------------------------
auto_txt = '''
<h3>Example using <code>px_size="auto"</code></h3>
<p>
Using circle glyph with radius specified, hence data units.
The scale bar could in this case relate to the size of the circles, and one
can use the argument <code>unit</code> to override default value.
Scale updates when zooming.
</p>
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

p_auto = figure(
    width = WIDTH, height = 400,
    active_scroll = 'wheel_zoom'
    )

p_auto.circle(
    x = 'x', y = 'y', radius = 'radius',
    fill_alpha = 0.5, fill_color = mapper, 
    source = src
    )

bar = ScaleBar(
    px_size = 'auto', scale_type = 'line', length = 100,
    unit = 'mm', y_offset = 2, fill_alpha = 0.5
    )
p_auto.add_layout(bar)
layout_auto = column(divelement(auto_txt), p_auto)

#------------------------------------------------------------------------------
# save plot objects to file
col1 = column(layout_map, layout_img, margin = (0, 20, 0, 0))
col2 = column(layout_auto)
layout = row(col1, col2, styles={'margin': 'auto'})
save(layout)
#save(p_auto)

