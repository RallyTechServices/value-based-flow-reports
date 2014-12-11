Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 5 },
    value_field: 'c_BenefitProductivityValue',
    group_field: 'State',
    benefit_fields: [],
    model: 'PortfolioItem/EPIC',
    items: [
        {xtype:'container',itemId:'selector_box', margin: 10},
        {xtype:'container',itemId:'display_box', margin: 10},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._getAllowedValuesFor(this.group_field).then({
            scope: this,
            success: function(allowed_values){
                this.logger.log("Allowed Values for ", this.group_field, allowed_values);
                this._addFieldPicker(this.down('#selector_box'),allowed_values);
                
            },
            failure: function(message) {
                this.down('#display_box').add({xtype:'container',html:'Error finding allowed values: ' + message});
            }
        });
    },
    _addFieldPicker: function(container,allowed_values) {
        container.add({
            xtype:'rallyfieldcombobox',
            fieldLabel: 'Value Field:',
            model: 'PortfolioItem',
            width: 300,
            labelWidth: 65,
            stateId: 'technicalservices.valuecfd.value_field',
            stateEvents: ['change'],
            stateful: true,
            listeners: {
                scope: this,
                staterestore: function(field_box,state) {
                    if ( state.value ) {
                        this.value_field = state.value;
                    }
                },
                ready: function(field_box) {
                    this._filterOutNonBenefitFields(field_box.getStore());
                    if ( this.value_field ) {
                        field_box.setValue(this.value_field);
                    } else {
                        field_box.setValue( field_box.getStore().getAt(0) );
                    }
                    this._addChart(this.down('#display_box'), allowed_values, field_box.getValue());

                },
                select: function(field_box) {
                    this._addChart(this.down('#display_box'), allowed_values, field_box.getValue());
                }
            }
        })
    },
    _addChart: function(container, allowed_values,value_field){
        this.logger.log('_addChart',allowed_values,value_field);
        container.removeAll();
        var project_oid = this.getContext().getProject().ObjectID;

        var start_date = Rally.util.DateTime.add(new Date(),"month",-2);
        var height = Ext.getBody().getHeight();
        
        if ( height > 75 ) {
            height = height - 75;
        }
        var fetch_fields = Ext.Array.merge([this.group_field],this.benefit_fields);
                
        container.add({
            xtype:'rallychart',
            storeType:'Rally.data.lookback.SnapshotStore',
            calculatorType:'Rally.technicalservices.ValueCFDCalculator',
            calculatorConfig: {
                allowed_values: allowed_values,
                benefit_fields: this.benefit_fields,
                group_field: this.group_field,
                value_field: value_field,
                startDate: start_date,
                endDate: new Date()
            },
            storeConfig: {
                filters:[                    
                    {property:'_TypeHierarchy',value: this.model},
                    {property:'_ProjectHierarchy', value: project_oid}
                ],
                fetch: fetch_fields,
                hydrate: [this.group_field]
            },
            chartConfig: {
                chart: {
                    zoomType: 'xy',
                    height: height
                },
                title: {
                    text: 'Cumulative Flow By Value'
                },
                xAxis: {
                    tickmarkPlacement: 'on',
                    tickInterval: 7,
                    title: {
                        text: ''
                    }
                },
                yAxis: [{title:{text: 'Value'}}],
                plotOptions: {
                    series: {
                        marker: { enabled: false },
                        stacking: 'normal'
                    }
                }
            }
        });
    },
    _filterOutNonBenefitFields: function(store,records) {
        var me = this;
        
        store.filter([{
            filterFn:function(field){ 
                var attribute_type = field.get('fieldDefinition').attributeDefinition.AttributeType;
                if (  attribute_type == "QUANTITY" || attribute_type == "INTEGER" || attribute_type == "DECIMAL" ) {
                    if ( field.get('name').replace('Benefit','') != field.get('name') ) { 
                        console.log("pushing",field.get('name'), "to", me.benefit_fields);
                        me.benefit_fields.push(field.get('value'));
                        return true; 
                    }
                }
                
                if ( field.get('name') == 'Object ID' ) {
                    field.set('name','-- All -- ');
                    field.set('value','__ALL');
                    return true;
                }
                return false;
            } 
        }]);
    },
    _getAllowedValuesFor: function(field_name){
        var deferred = Ext.create('Deft.Deferred');
        Rally.data.ModelFactory.getModel({
            scope: this,
            type:this.model,
            context: {
                workspace: this.getContext().getWorkspace()
            },
            success: function(model){
                var field = model.getField(this.group_field);
                field.getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        var allowed_values = [];
                        Ext.Array.each(records, function(allowedValue) {
                           allowed_values.push(allowedValue.get('StringValue'));
                        });
                        
                        deferred.resolve(allowed_values);
                    }
                });
            },
            failure: function(message) {
                deferred.reject(message);
            }
        });
        
        return deferred.promise;
    }
});