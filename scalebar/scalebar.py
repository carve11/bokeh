from bokeh.models import Annotation, PolyAnnotation, LabelSet, ColumnDataSource
from bokeh.core.enums import enumeration
from bokeh.core.properties import (
    Auto,
    Color,
    Either,
    Enum,
    Float,
    Include,
    Int,
    Override,
    String
    )
from bokeh.core.property_mixins import (
    ScalarFillProps,
    ScalarLineProps,
    ScalarTextProps
    )
    


ScaleTypes = enumeration('bar', 'line')
SystemOfMeasure = enumeration('metric', 'imperial', 'scientific')
Location = enumeration('bottom_left', 'top_left', 'bottom_right', 'top_right')
Units = enumeration('in', 'ft', 'mi', 'km', 'm', 'cm', 'mm', 'μm','nm',
    'pm', 'fm', 'am', 'zm', 'ym', 'um')

class ScaleBar(Annotation):
    ''' Render a scalebar as an annotation. Scale is updated when zoom
    is used.
    '''

    __implementation__ = 'scalebar.ts'

    text_props = Include(ScalarTextProps, help="""
    The {prop} values for the text.
    """)

    line_props = Include(ScalarLineProps, help="""
    The {prop} values for the polygon.
    """)

    fill_props = Include(ScalarFillProps, help="""
    The {prop} values for the polygon.
    """)

    scale_type = Enum(ScaleTypes, default='bar', help='''
    Type of scale to draw, either ``bar`` with alternating dark and 
    light colors or a simple ``line``.
    ''')

    bar_dark_color = Color(default='grey', help='''
    Color to use for the dark filling of the ``bar`` scale.  
    ''')

    bar_light_color = Color(default='white', help='''
    Color to use for the light filling of the ``bar`` scale.
    ''')

    height = Int(default=7, help='''
    Height of scale.
    ''')

    length = Int(default=125, help='''
    Target length of scale bar. In order to have nice values for 
    scale labels the length gets adjusted.
    ''')

    padding = Int(default=2, help='''
    For the scale of type ``line`` a background filling is added. 
    Padding is amount of background that is outside the scale.
    '''
    )

    px_size = Either(Auto, String, Float, default='auto', help='''
    Pixel size: data units per pixel based on the specified ``unit``.

    Acceptable values are:

      * ``auto``: pixel size determined automatically from x-axis.

      * ``mercator``: pixel size is calculated based on great circle
    distance between 2 points.

      * float: Use a specific number, eg. if using the scale on an
    image with known resolution.
    ''')

    location = Enum(Location, default='bottom_left', help='''
    Location of scale. Accepted values are ``bottom-left``,  ``top-left``,
    ``bottom-right`` and ``top-right``.
    ''')

    unit = Enum(Units, default='m', help='''
    Unit of scale. Default is ``m``. Acceptable values are ``m`` with 
    SI predix or imperial units `ìn``, ``ft`` and ``mi``. Ignored if
    ``px_size`` is equal to ``mercator`` which is fixed to ``m``.
    ''')

    system_of_measure = Enum(SystemOfMeasure, default='metric', help='''
    System of measurement that ``unit`` and ``px_size`` is based on.

    Acceptable values are:

      * ``metric``: SI pefix

      * ``imperial``: in, ft and mi

      * ``scientific``: scientific notation eg. 10⁵
    ''')

    y_offset = Float(default=3, help='''
    Offset value to apply to scale labels in the y-coordinate. 
    Default vaule reflects ``bar`` scale type. 
    ''')

    text_color = Override(default='#444444')

    text_font = Override(default='helvetica')

    text_font_size = Override(default='11px')

    text_font_style = Override(default='normal')

    line_color = Override(default='#444444')
    
    line_alpha = Override(default=1)
    
    line_width = Override(default=1)

    fill_alpha = Override(default=1.0)

